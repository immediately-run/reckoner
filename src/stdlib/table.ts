// The fluent `table()` API (ARCHITECTURE_PLAN §3.1). A thin, chainable layer over the
// free functions in ./shaping.ts and ./ordered.ts — same semantics, no separate engine
// or columnar runtime. `table(rows)…rows()` in, plain rows out; end every chain with
// `.rows()` so a formula returns plain data, never a Table instance.

import type { Aggregator, Predicate, Projection, Row } from './types.ts';
import * as shaping from './shaping.ts';
import type { JoinOptions, PivotOptions, SortKey, TopNOptions } from './shaping.ts';
import * as ordered from './ordered.ts';
import type { AsofOptions, LagOptions, ScanOp, WindowOptions } from './ordered.ts';

type Rowish = Table | Row[];

function toRows(x: Rowish): Row[] {
  return x instanceof Table ? x.rows() : x;
}

/** A group produced by {@link Table.groupBy}, ready for `.rollup()`. */
export class GroupedTable {
  readonly #groups: shaping.Group[];

  constructor(groups: shaping.Group[]) {
    this.#groups = groups;
  }

  /** Collapse each group to one row: its key columns plus one column per aggregator. */
  rollup(spec: Record<string, Aggregator>): Table {
    return new Table(shaping.rollup(this.#groups, spec));
  }

  /** Alias of {@link GroupedTable.rollup}. */
  aggregate(spec: Record<string, Aggregator>): Table {
    return this.rollup(spec);
  }
}

/** A chainable, immutable view over a set of rows. Every method returns a fresh Table. */
export class Table {
  readonly #rows: Row[];

  constructor(rows: Row[]) {
    this.#rows = rows;
  }

  /** Exit the fluent layer back to plain rows. */
  rows(): Row[] {
    return this.#rows;
  }

  filter(pred: Predicate): Table {
    return new Table(shaping.filter(this.#rows, pred));
  }

  derive(spec: Record<string, Projection>): Table {
    return new Table(shaping.derive(this.#rows, spec));
  }

  sort(by: string | SortKey[]): Table {
    return new Table(shaping.sort(this.#rows, by));
  }

  groupBy(keys: string | string[]): GroupedTable {
    return new GroupedTable(shaping.groupBy(this.#rows, keys));
  }

  /** Group then rollup in one step. */
  aggregate(keys: string | string[], spec: Record<string, Aggregator>): Table {
    return new Table(shaping.aggregate(this.#rows, keys, spec));
  }

  join(right: Rowish, opts: JoinOptions): Table {
    return new Table(shaping.join(this.#rows, toRows(right), opts));
  }

  antiJoin(right: Rowish, opts: { on: JoinOptions['on'] }): Table {
    return new Table(shaping.antiJoin(this.#rows, toRows(right), opts));
  }

  pivot(opts: PivotOptions): Table {
    return new Table(shaping.pivot(this.#rows, opts));
  }

  topN(n: number, opts: TopNOptions): Table {
    return new Table(shaping.topN(this.#rows, n, opts));
  }

  lag(col: string, opts: LagOptions): Table {
    return new Table(ordered.lag(this.#rows, col, opts));
  }

  lead(col: string, opts: LagOptions): Table {
    return new Table(ordered.lead(this.#rows, col, opts));
  }

  scan(spec: Record<string, ScanOp>, opts: WindowOptions = {}): Table {
    return new Table(ordered.scan(this.#rows, spec, opts));
  }

  asofJoin(right: Rowish, opts: AsofOptions): Table {
    return new Table(ordered.asofJoin(this.#rows, toRows(right), opts));
  }
}

/**
 * Wrap rows in the fluent shaping API. Accepts plain rows or another Table (so chains
 * compose). The input array is not copied; Table methods never mutate it.
 */
export function table(rows: Rowish): Table {
  return new Table(toRows(rows));
}
