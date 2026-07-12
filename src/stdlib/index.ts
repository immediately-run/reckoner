// `@reckoner/stdlib` — the pure formula stdlib (ARCHITECTURE_PLAN §3.2).
//
// This is the entire vocabulary a Reckoner formula may import: shaping, aggregation,
// ordered/relational window functions, pure date helpers, and null semantics. It is
// additive-only forever (a mis-designed function can never be removed), so it errs
// toward too little. Everything here is a pure function of plain values → plain values;
// there is no ambient `fetch`/`console`/clock/random and no cell registry.
//
// The pure formula vocabulary is now complete for M1. The formula engine (SES compartment,
// scheduler) that *evaluates* these descriptors lives in `../engine`; the metamorphic
// relations here carry their pure transform + comparison, and the M2 test runner supplies
// the re-evaluation (see relations.ts).

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

// Screening (assistant-facing message-finding tools).
export { trend, outliers, deltas } from './screening.ts';
export type { Trend } from './screening.ts';

// Event-time feed windowing (distinct from the window functions lag/lead/scan).
export { window, parseDuration } from './window.ts';

// Cell registration constructors (the document-model contract the engine reads).
export { cell, testCell } from './cell.ts';
export type {
  CellDef,
  CellInit,
  ExpectFn,
  Formula,
  TestCellDef,
  TestCellInit,
  TestKind,
} from './cell.ts';

// Input-spec parsing (dependency extraction for the scheduler/taint fold/test runner).
export { dependencies, normalizeInputs, parseInput } from './inputs.ts';
export type { InputSpec, Namespace, WindowedFeed } from './inputs.ts';

// Test assertions.
export { deepEqual, expectClose, expectEqual } from './testing.ts';
export type { CloseTolerance, TestResult } from './testing.ts';

// Metamorphic / property relations (the load-bearing, oracle-free correctness signal).
export { conservation, permutationInvariance, property, scaleInvariance } from './relations.ts';
export type { Relation, RelationContext } from './relations.ts';

// The agent-facing self-description catalog.
export { catalog, catalogNames } from './catalog.ts';
export type { CallableKind, ParamDesc, SelfDescription } from './catalog.ts';
