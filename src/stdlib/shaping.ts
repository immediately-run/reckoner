// Reductive shaping — the SQL-relational core (ARCHITECTURE_PLAN §3.2). Free functions
// over `Row[]`; the fluent `table()` API in ./table.ts is a thin wrapper over exactly
// these, so there is one implementation and one semantics, no second engine.

import type { Aggregator, Predicate, Projection, Row, Value } from './types.ts';
import { asArray, collectColsExcept, compareScalar, isPresent, keyOf, sanitize } from './internal.ts';
import { first } from './aggregate.ts';

export type SortKey = string | { col: string; dir?: 'asc' | 'desc' };

/** A group of rows sharing a key tuple, produced by {@link groupBy}. */
export interface Group {
  keys: Row;
  rows: Row[];
}

export interface JoinOptions {
  /** Join key(s). A string/array joins same-named columns; `{left,right}` maps names. */
  on: string | string[] | { left: string | string[]; right: string | string[] };
  /** `inner` (default) keeps matched rows; `left` keeps every left row; `full` keeps both sides. */
  how?: 'inner' | 'left' | 'full';
}

export interface PivotOptions {
  index: string | string[];
  columns: string;
  values: string;
  /** How to combine multiple source rows landing in one cell; defaults to taking the first. */
  aggregate?: Aggregator;
  /** Value for cells with no source row; defaults to `null`. */
  fill?: Value;
}

export interface TopNOptions {
  by: string;
  /** Largest-first by default. */
  desc?: boolean;
  /** Build a trailing "Other" bucket row from the rows beyond the top N. */
  other?: (rest: Row[]) => Row;
}

/** Keep the rows for which `pred` is true. */
export function filter(rows: Row[], pred: Predicate): Row[] {
  return rows.filter(pred);
}

/**
 * Add computed columns. Projections are applied in declaration order and each sees the
 * columns added before it, so a later key can build on an earlier one. Numeric results
 * are sanitized (`NaN`/`±Infinity` → `null`) so a bad arithmetic never leaks silently.
 */
export function derive(rows: Row[], spec: Record<string, Projection>): Row[] {
  const keys = Object.keys(spec);
  return rows.map((row) => {
    const out: Row = { ...row };
    for (const k of keys) out[k] = sanitize(spec[k](out));
    return out;
  });
}

/** Stable multi-key sort. `null`/absent values sort last in both directions. */
export function sort(rows: Row[], by: string | SortKey[]): Row[] {
  const keys = normalizeSortKeys(by);
  return rows.slice().sort((a, b) => {
    for (const { col, dir } of keys) {
      const av = a[col];
      const bv = b[col];
      // Null/absent always sorts last, independent of direction — it is "no value",
      // not "smallest value", so `desc` must not flip it to the front.
      const ae = !isPresent(av);
      const be = !isPresent(bv);
      if (ae && be) continue;
      if (ae) return 1;
      if (be) return -1;
      const c = compareScalar(av, bv);
      if (c !== 0) return dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

/** Bucket rows by a key tuple, preserving first-seen group order. */
export function groupBy(rows: Row[], keySpec: string | string[]): Group[] {
  const cols = asArray(keySpec);
  const index = new Map<string, Group>();
  const order: Group[] = [];
  for (const row of rows) {
    const k = keyOf(row, cols);
    let g = index.get(k);
    if (g === undefined) {
      const keys: Row = {};
      for (const c of cols) keys[c] = row[c] ?? null;
      g = { keys, rows: [] };
      index.set(k, g);
      order.push(g);
    }
    g.rows.push(row);
  }
  return order;
}

/** Collapse each group to one row: its key columns plus one column per aggregator. */
export function rollup(groups: Group[], spec: Record<string, Aggregator>): Row[] {
  const keys = Object.keys(spec);
  return groups.map((g) => {
    const out: Row = { ...g.keys };
    for (const k of keys) out[k] = sanitize(spec[k](g.rows));
    return out;
  });
}

/** Group then rollup in one call — `rollup(groupBy(rows, keySpec), spec)`. */
export function aggregate(
  rows: Row[],
  keySpec: string | string[],
  spec: Record<string, Aggregator>,
): Row[] {
  return rollup(groupBy(rows, keySpec), spec);
}

/**
 * Relational join. A left/`asof` miss yields `null` for the right columns (never an
 * absent row); `how:"full"` also emits unmatched right rows with `null` left columns.
 * On a non-key column-name collision the right value wins.
 */
export function join(left: Row[], right: Row[], opts: JoinOptions): Row[] {
  const how = opts.how ?? 'inner';
  const { left: lc, right: rc } = normalizeOn(opts.on);
  const rightExtra = collectColsExcept(right, rc);
  const leftCols = collectColsExcept(left, []);

  const index = new Map<string, Row[]>();
  for (const r of right) {
    const k = keyOf(r, rc);
    const arr = index.get(k);
    if (arr) arr.push(r);
    else index.set(k, [r]);
  }

  const matchedRight = new Set<Row>();
  const out: Row[] = [];
  for (const lrow of left) {
    const matches = index.get(keyOf(lrow, lc));
    if (matches !== undefined && matches.length > 0) {
      for (const rrow of matches) {
        matchedRight.add(rrow);
        out.push(mergeMatch(lrow, rrow, rightExtra));
      }
    } else if (how === 'left' || how === 'full') {
      out.push(mergeMiss(lrow, rightExtra));
    }
  }

  if (how === 'full') {
    for (const rrow of right) {
      if (!matchedRight.has(rrow)) out.push(mergeRightOnly(rrow, lc, rc, leftCols, rightExtra));
    }
  }
  return out;
}

/** Keep only left rows that have **no** match in `right` (the review-1 churn primitive). */
export function antiJoin(
  left: Row[],
  right: Row[],
  opts: { on: JoinOptions['on'] },
): Row[] {
  const { left: lc, right: rc } = normalizeOn(opts.on);
  const rightKeys = new Set<string>();
  for (const r of right) rightKeys.add(keyOf(r, rc));
  return left.filter((r) => !rightKeys.has(keyOf(r, lc)));
}

/**
 * Long → wide: one row per `index` tuple, one column per distinct `columns` value
 * (sorted for determinism), each cell the aggregated `values`. Absent cells get `fill`
 * (`null` by default). Normalize before you pivot (DSL-4).
 */
export function pivot(rows: Row[], opts: PivotOptions): Row[] {
  const indexCols = asArray(opts.index);
  const agg = opts.aggregate ?? first(opts.values);
  const fill = opts.fill ?? null;

  const colValues: Value[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const cv = r[opts.columns] ?? null;
    const tag = `${typeof cv}:${JSON.stringify(cv)}`;
    if (!seen.has(tag)) {
      seen.add(tag);
      colValues.push(cv);
    }
  }
  colValues.sort(compareScalar);

  return groupBy(rows, indexCols).map((g) => {
    const out: Row = { ...g.keys };
    for (const cv of colValues) {
      const cellRows = g.rows.filter((r) => (r[opts.columns] ?? null) === cv);
      out[String(cv)] = cellRows.length > 0 ? sanitize(agg(cellRows)) : fill;
    }
    return out;
  });
}

/**
 * The top `n` rows by `by` (largest-first by default). With `other`, the remaining rows
 * are collapsed into one trailing bucket row the caller shapes — the "Other" row that
 * keeps a concentration table's total honest (DSL-7).
 */
export function topN(rows: Row[], n: number, opts: TopNOptions): Row[] {
  const desc = opts.desc ?? true;
  const sorted = sort(rows, [{ col: opts.by, dir: desc ? 'desc' : 'asc' }]);
  const head = sorted.slice(0, n);
  if (opts.other !== undefined && sorted.length > n) head.push(opts.other(sorted.slice(n)));
  return head;
}

// --- internals -----------------------------------------------------------------

function normalizeSortKeys(by: string | SortKey[]): { col: string; dir: 'asc' | 'desc' }[] {
  const keys = typeof by === 'string' ? [by] : by;
  return keys.map((k) =>
    typeof k === 'string' ? { col: k, dir: 'asc' } : { col: k.col, dir: k.dir ?? 'asc' },
  );
}

function normalizeOn(on: JoinOptions['on']): { left: string[]; right: string[] } {
  if (typeof on === 'string') return { left: [on], right: [on] };
  if (Array.isArray(on)) return { left: on.slice(), right: on.slice() };
  return { left: asArray(on.left), right: asArray(on.right) };
}

function mergeMatch(lrow: Row, rrow: Row, rightExtra: string[]): Row {
  const out: Row = { ...lrow };
  for (const c of rightExtra) out[c] = rrow[c] ?? null;
  return out;
}

function mergeMiss(lrow: Row, rightExtra: string[]): Row {
  const out: Row = { ...lrow };
  for (const c of rightExtra) out[c] = null;
  return out;
}

function mergeRightOnly(
  rrow: Row,
  lc: string[],
  rc: string[],
  leftCols: string[],
  rightExtra: string[],
): Row {
  const out: Row = {};
  for (const c of leftCols) out[c] = null;
  lc.forEach((lcol, i) => {
    out[lcol] = rrow[rc[i]] ?? null;
  });
  for (const c of rightExtra) out[c] = rrow[c] ?? null;
  return out;
}
