// `@reckoner/stdlib` — the pure formula stdlib (ARCHITECTURE_PLAN §3.2).
//
// This is the entire vocabulary a Reckoner formula may import: shaping, aggregation,
// ordered/relational window functions, pure date helpers, and null semantics. It is
// additive-only forever (a mis-designed function can never be removed), so it errs
// toward too little. Everything here is a pure function of plain values → plain values;
// there is no ambient `fetch`/`console`/clock/random and no cell registry.
//
// This M1 slice is the computational core. Still to land (tracked, follow-up PRs):
// the `cell()`/`testCell()` registration constructors, the metamorphic testing
// relations (`conservation`/`permutationInvariance`/`scaleInvariance`/`property`/
// `expectClose`), the assistant-facing screening tools (`trend`/`outliers`/`deltas`),
// event-time feed `window` buffering, and the JSON-Schema self-description catalog.

export type { Aggregator, Predicate, Projection, Row, Scalar, Value } from './types.ts';

// Fluent shaping API + its building blocks.
export { table, Table, GroupedTable } from './table.ts';
export {
  aggregate,
  antiJoin,
  derive,
  filter,
  groupBy,
  join,
  pivot,
  rollup,
  sort,
  topN,
} from './shaping.ts';
export type { Group, JoinOptions, PivotOptions, SortKey, TopNOptions } from './shaping.ts';

// Aggregators (used inside `rollup`).
export { count, first, max, mean, median, min, quantile, sum } from './aggregate.ts';

// Ordered / relational-across-rows.
export {
  asofJoin,
  cummax,
  cummin,
  cumsum,
  cumulative,
  ema,
  lag,
  lead,
  runningMean,
  scan,
} from './ordered.ts';
export type { AsofOptions, LagOptions, ScanOp, WindowOptions } from './ordered.ts';

// Pure date helpers (no ambient clock).
export {
  addDays,
  addMonths,
  fiscalPeriod,
  monthKey,
  monthsBetween,
  resolveRange,
  truncate,
} from './dates.ts';
export type { DateInput, DateRange, FiscalPeriod } from './dates.ts';

// Null / empty semantics.
export { coalesce, orElse, safeDiv } from './nulls.ts';
