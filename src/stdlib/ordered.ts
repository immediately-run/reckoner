// Ordered / relational-across-rows shaping (ARCHITECTURE_PLAN §3.2, DSL-1/2/3). The SQL
// window-function + as-of set: `lag`/`lead`, `scan` (running folds), and `asofJoin`
// (nearest-preceding match). Without these the case study's defining logic —
// month-over-month movement, running retention, gapped-FX carry-forward — collapses to
// the hand-rolled `.reduce` loops the design exists to prevent.
//
// `lag`/`lead`/`scan` operate within each partition in the current row order; pass
// `orderBy` (or `.sort()` first) to make that order explicit — window semantics need a
// defined order, and leaving it implicit is a silent-bug source.

import type { Row, Value } from './types.ts';
import { asArray, collectColsExcept, compareScalar, keyOf, sanitize } from './internal.ts';
import { sort } from './shaping.ts';
import type { SortKey } from './shaping.ts';

export interface WindowOptions {
  partitionBy?: string | string[];
  orderBy?: string | SortKey[];
}

export interface LagOptions extends WindowOptions {
  /** Name of the column to write the shifted value into. */
  as: string;
  /** How many rows back (`lag`) or forward (`lead`); default 1. */
  n?: number;
  /** Value at the partition edge where no neighbor exists; default `null`. */
  fill?: Value;
}

/** A running fold over a partition's rows, producing one output value per row. */
export type ScanOp = (rows: Row[]) => Value[];

/** Value of `col` from `n` rows earlier within the partition; `fill` at the leading edge. */
export function lag(rows: Row[], col: string, opts: LagOptions): Row[] {
  const n = opts.n ?? 1;
  const fill = opts.fill ?? null;
  return partitioned(rows, opts, (part) =>
    part.map((row, i) => ({ ...row, [opts.as]: i >= n ? part[i - n][col] ?? null : fill })),
  );
}

/** Value of `col` from `n` rows later within the partition; `fill` at the trailing edge. */
export function lead(rows: Row[], col: string, opts: LagOptions): Row[] {
  const n = opts.n ?? 1;
  const fill = opts.fill ?? null;
  return partitioned(rows, opts, (part) =>
    part.map((row, i) =>
      i + n < part.length ? { ...row, [opts.as]: part[i + n][col] ?? null } : { ...row, [opts.as]: fill },
    ),
  );
}

/** Add one column per running fold, computed within each partition in order. */
export function scan(rows: Row[], spec: Record<string, ScanOp>, opts: WindowOptions = {}): Row[] {
  const names = Object.keys(spec);
  return partitioned(rows, opts, (part) => {
    const series = names.map((name) => spec[name](part));
    return part.map((row, i) => {
      const out: Row = { ...row };
      names.forEach((name, k) => {
        out[name] = sanitize(series[k][i]);
      });
      return out;
    });
  });
}

/** Alias of {@link scan} — reads more naturally for cumulative columns. */
export const cumulative = scan;

/** Running sum; `null` until the first finite value, then carried across nulls. */
export function cumsum(col: string): ScanOp {
  return runningReduce(col, (acc, v) => (acc === null ? v : acc + v));
}

/** Running maximum of the finite values seen so far. */
export function cummax(col: string): ScanOp {
  return runningReduce(col, (acc, v) => (acc === null ? v : Math.max(acc, v)));
}

/** Running minimum of the finite values seen so far. */
export function cummin(col: string): ScanOp {
  return runningReduce(col, (acc, v) => (acc === null ? v : Math.min(acc, v)));
}

/** Running arithmetic mean of the finite values seen so far. */
export function runningMean(col: string): ScanOp {
  return (rows: Row[]): Value[] => {
    let total = 0;
    let n = 0;
    return rows.map((r) => {
      const v = r[col];
      if (typeof v === 'number' && Number.isFinite(v)) {
        total += v;
        n += 1;
      }
      return n === 0 ? null : total / n;
    });
  };
}

/** Exponential moving average with smoothing factor `alpha` (0..1). */
export function ema(col: string, alpha: number): ScanOp {
  return (rows: Row[]): Value[] => {
    let prev: number | null = null;
    return rows.map((r) => {
      const v = r[col];
      if (typeof v === 'number' && Number.isFinite(v)) {
        prev = prev === null ? v : alpha * v + (1 - alpha) * prev;
      }
      return prev;
    });
  };
}

export interface AsofOptions {
  /** Exact-match key(s) — the FX currency, the customer. Optional (global match if omitted). */
  on?: string | string[];
  /** The ordered key matched by nearest-preceding (`backward`) or nearest-following (`forward`). */
  match: string;
  direction?: 'backward' | 'forward';
}

/**
 * As-of join: for each left row, bring in the right row whose `match` key is nearest
 * without overshooting (`backward`, the default — the FX carry-forward across the gap)
 * or nearest at-or-after (`forward`), among right rows sharing the exact-match `on`
 * keys. A miss yields `null` for the right columns.
 */
export function asofJoin(left: Row[], right: Row[], opts: AsofOptions): Row[] {
  const onCols = opts.on !== undefined ? asArray(opts.on) : [];
  const dir = opts.direction ?? 'backward';
  const extra = collectColsExcept(right, [...onCols, opts.match]);

  const buckets = new Map<string, Row[]>();
  for (const r of right) {
    const k = keyOf(r, onCols);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  for (const arr of buckets.values()) arr.sort((a, b) => compareScalar(a[opts.match], b[opts.match]));

  return left.map((lrow) => {
    const out: Row = { ...lrow };
    const arr = buckets.get(keyOf(lrow, onCols));
    let picked: Row | null = null;
    if (arr !== undefined) {
      const target = lrow[opts.match];
      if (dir === 'backward') {
        for (const rr of arr) {
          if (compareScalar(rr[opts.match], target) <= 0) picked = rr;
          else break;
        }
      } else {
        for (const rr of arr) {
          if (compareScalar(rr[opts.match], target) >= 0) {
            picked = rr;
            break;
          }
        }
      }
    }
    for (const c of extra) out[c] = picked !== null ? picked[c] ?? null : null;
    return out;
  });
}

// --- internals -----------------------------------------------------------------

function partitioned(rows: Row[], opts: WindowOptions, fn: (part: Row[]) => Row[]): Row[] {
  const ordered = opts.orderBy !== undefined ? sort(rows, opts.orderBy) : rows.slice();
  const pcols = opts.partitionBy !== undefined ? asArray(opts.partitionBy) : [];

  const partIndex = new Map<string, number>();
  const parts: Row[][] = [];
  const rowPart: number[] = [];
  const rowPos: number[] = [];
  for (const r of ordered) {
    const pk = keyOf(r, pcols);
    let idx = partIndex.get(pk);
    if (idx === undefined) {
      idx = parts.length;
      partIndex.set(pk, idx);
      parts.push([]);
    }
    rowPart.push(idx);
    rowPos.push(parts[idx].length);
    parts[idx].push(r);
  }

  const transformed = parts.map(fn);
  return ordered.map((_, i) => transformed[rowPart[i]][rowPos[i]]);
}

function runningReduce(col: string, step: (acc: number | null, v: number) => number): ScanOp {
  return (rows: Row[]): Value[] => {
    let acc: number | null = null;
    return rows.map((r) => {
      const v = r[col];
      if (typeof v === 'number' && Number.isFinite(v)) acc = step(acc, v);
      return acc;
    });
  };
}
