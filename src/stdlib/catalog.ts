// Self-description catalog (ARCHITECTURE_PLAN §3.2, RQ-A5). Every formula-facing callable
// ships a machine-readable self-description — a one-line purpose, per-parameter docs with
// enums for closed choices, a return description, and 1–2 worked examples. This catalog is
// a first-class evaluated artifact: it is what the M0 A1 bake-off (E-1) and the RQ-A5
// agent-loop gate (E-6) inject as the agent's tool descriptions, and `catalog.test.ts`
// gates it against the actual exports so a new callable cannot ship undescribed and a
// description cannot rot away from its function.

export interface ParamDesc {
  name: string;
  /** A JSON-Schema-ish type label: `string`, `number`, `Row[]`, `Aggregator`, `object`, … */
  type: string;
  doc: string;
  /** Closed set of allowed string values, when applicable. */
  enum?: string[];
  optional?: boolean;
}

export type CallableKind =
  | 'shaping'
  | 'aggregator'
  | 'window'
  | 'date'
  | 'null'
  | 'constructor'
  | 'testing'
  | 'relation';

export interface SelfDescription {
  name: string;
  kind: CallableKind;
  /** One-line purpose. */
  summary: string;
  params: ParamDesc[];
  returns: string;
  /** 1–2 worked examples as code snippets. */
  examples: string[];
}

const rows: ParamDesc = { name: 'rows', type: 'Row[]', doc: 'The input rows.' };
const col = (doc: string): ParamDesc => ({ name: 'col', type: 'string', doc });

const entries: SelfDescription[] = [
  // --- fluent + reductive shaping ------------------------------------------------
  {
    name: 'table',
    kind: 'shaping',
    summary: 'Wrap rows in the fluent shaping API; end chains with .rows().',
    params: [{ name: 'rows', type: 'Row[] | Table', doc: 'Rows (or another Table) to shape.' }],
    returns: 'Table — a chainable, immutable view.',
    examples: ['table(orders).filter(r => r.region === "EMEA").rows()'],
  },
  {
    name: 'filter',
    kind: 'shaping',
    summary: 'Keep the rows for which a predicate is true.',
    params: [rows, { name: 'pred', type: '(row) => boolean', doc: 'Row predicate.' }],
    returns: 'Row[] — the matching rows.',
    examples: ['filter(orders, r => r.amount > 0)'],
  },
  {
    name: 'derive',
    kind: 'shaping',
    summary: 'Add computed columns; NaN/±Infinity results become null.',
    params: [
      rows,
      { name: 'spec', type: 'Record<string, (row) => Value>', doc: 'newColumn → projection; later keys see earlier ones.' },
    ],
    returns: 'Row[] with the added columns.',
    examples: ['derive(rows, { eur: r => r.amount * r.rate })'],
  },
  {
    name: 'sort',
    kind: 'shaping',
    summary: 'Stable multi-key sort; null/absent sorts last in both directions.',
    params: [
      rows,
      { name: 'by', type: 'string | SortKey[]', doc: 'A column, or [{ col, dir: "asc"|"desc" }].' },
    ],
    returns: 'Row[] — a sorted copy (input is not mutated).',
    examples: ['sort(rows, [{ col: "arr", dir: "desc" }])'],
  },
  {
    name: 'groupBy',
    kind: 'shaping',
    summary: 'Bucket rows by a key tuple, preserving first-seen group order.',
    params: [rows, { name: 'keys', type: 'string | string[]', doc: 'Grouping column(s).' }],
    returns: 'Group[] — pass to rollup.',
    examples: ['rollup(groupBy(rows, "month"), { revenue: sum("eur") })'],
  },
  {
    name: 'rollup',
    kind: 'shaping',
    summary: 'Collapse each group to one row: key columns plus one column per aggregator.',
    params: [
      { name: 'groups', type: 'Group[]', doc: 'Output of groupBy.' },
      { name: 'spec', type: 'Record<string, Aggregator>', doc: 'outputColumn → aggregator.' },
    ],
    returns: 'Row[] — one row per group.',
    examples: ['rollup(groupBy(rows, "region"), { total: sum("mrr") })'],
  },
  {
    name: 'aggregate',
    kind: 'shaping',
    summary: 'groupBy then rollup in one call.',
    params: [
      rows,
      { name: 'keys', type: 'string | string[]', doc: 'Grouping column(s).' },
      { name: 'spec', type: 'Record<string, Aggregator>', doc: 'outputColumn → aggregator.' },
    ],
    returns: 'Row[] — one row per group.',
    examples: ['aggregate(rows, "month", { revenue: sum("eur") })'],
  },
  {
    name: 'join',
    kind: 'shaping',
    summary: 'Relational join; a miss yields null right columns (never a dropped row for left/full).',
    params: [
      { name: 'left', type: 'Row[]', doc: 'Left rows.' },
      { name: 'right', type: 'Row[]', doc: 'Right rows.' },
      {
        name: 'opts',
        type: '{ on, how? }',
        doc: 'on: string | string[] | {left,right}. how: inner|left|full.',
        enum: ['inner', 'left', 'full'],
      },
    ],
    returns: 'Row[] — joined rows.',
    examples: ['join(orders, fx, { on: "currency" })'],
  },
  {
    name: 'antiJoin',
    kind: 'shaping',
    summary: 'Keep only left rows with no match in right (the churn primitive).',
    params: [
      { name: 'left', type: 'Row[]', doc: 'Left rows.' },
      { name: 'right', type: 'Row[]', doc: 'Right rows.' },
      { name: 'opts', type: '{ on }', doc: 'Join key(s).' },
    ],
    returns: 'Row[] — unmatched left rows.',
    examples: ['antiJoin(thisMonth, lastMonth, { on: "customer" }) // = new customers'],
  },
  {
    name: 'pivot',
    kind: 'shaping',
    summary: 'Long → wide: one row per index, one column per distinct value; normalize before you pivot.',
    params: [
      rows,
      {
        name: 'opts',
        type: '{ index, columns, values, aggregate?, fill? }',
        doc: 'index: row key(s); columns: field spread to columns; values: cell source column.',
      },
    ],
    returns: 'Row[] — the wide frame; absent cells are fill (null default).',
    examples: ['pivot(rows, { index: "cohort", columns: "offset", values: "pct" })'],
  },
  {
    name: 'topN',
    kind: 'shaping',
    summary: 'Top N rows by a column, optionally folding the rest into one "Other" bucket.',
    params: [
      rows,
      { name: 'n', type: 'number', doc: 'How many rows to keep.' },
      { name: 'opts', type: '{ by, desc?, other? }', doc: 'by: ranking column; other: (rest) => Row builds the bucket.' },
    ],
    returns: 'Row[] — top N, plus an Other row when supplied.',
    examples: ['topN(custs, 10, { by: "arr", other: rest => ({ name: "Other", arr: sum("arr")(rest) }) })'],
  },

  // --- aggregators ---------------------------------------------------------------
  {
    name: 'sum',
    kind: 'aggregator',
    summary: 'Σ of the finite numbers in a column; null if there are none.',
    params: [col('Column to sum.')],
    returns: 'Aggregator (rows) => number | null.',
    examples: ['rollup(g, { total: sum("eur") })'],
  },
  {
    name: 'mean',
    kind: 'aggregator',
    summary: 'Arithmetic mean of a column; null over an empty/all-null group.',
    params: [col('Column to average.')],
    returns: 'Aggregator (rows) => number | null.',
    examples: ['rollup(g, { avg: mean("mrr") })'],
  },
  {
    name: 'median',
    kind: 'aggregator',
    summary: 'Median of a column; null over an empty/all-null group.',
    params: [col('Column.')],
    returns: 'Aggregator (rows) => number | null.',
    examples: ['rollup(g, { p50: median("latency") })'],
  },
  {
    name: 'quantile',
    kind: 'aggregator',
    summary: 'q-quantile (0..1) of a column by linear interpolation; null if empty.',
    params: [col('Column.'), { name: 'q', type: 'number', doc: 'Quantile in [0,1].' }],
    returns: 'Aggregator (rows) => number | null.',
    examples: ['rollup(g, { p95: quantile("latency", 0.95) })'],
  },
  {
    name: 'min',
    kind: 'aggregator',
    summary: 'Minimum finite number in a column; null if none.',
    params: [col('Column.')],
    returns: 'Aggregator (rows) => number | null.',
    examples: ['rollup(g, { lo: min("price") })'],
  },
  {
    name: 'max',
    kind: 'aggregator',
    summary: 'Maximum finite number in a column; null if none.',
    params: [col('Column.')],
    returns: 'Aggregator (rows) => number | null.',
    examples: ['rollup(g, { hi: max("price") })'],
  },
  {
    name: 'count',
    kind: 'aggregator',
    summary: 'count() counts rows; count(col) counts present (non-null) values.',
    params: [{ name: 'col', type: 'string', doc: 'Optional column to count present values of.', optional: true }],
    returns: 'Aggregator (rows) => number.',
    examples: ['rollup(g, { n: count(), rated: count("rating") })'],
  },
  {
    name: 'first',
    kind: 'aggregator',
    summary: "Take the first row's value for a column (order-preserving); null if empty.",
    params: [col('Column.')],
    returns: 'Aggregator (rows) => Value.',
    examples: ['rollup(g, { name: first("customer_name") })'],
  },

  // --- ordered / relational ------------------------------------------------------
  {
    name: 'lag',
    kind: 'window',
    summary: 'Value of a column from n rows earlier within each partition; fill at the leading edge.',
    params: [
      rows,
      col('Source column.'),
      { name: 'opts', type: '{ as, n?, fill?, partitionBy?, orderBy? }', doc: 'as: new column; n: rows back (default 1).' },
    ],
    returns: 'Row[] with the shifted column; rows come out in orderBy order.',
    examples: ['lag(rows, "mrr", { as: "prev_mrr", partitionBy: "customer", orderBy: "month" })'],
  },
  {
    name: 'lead',
    kind: 'window',
    summary: 'Value of a column from n rows later within each partition; fill at the trailing edge.',
    params: [
      rows,
      col('Source column.'),
      { name: 'opts', type: '{ as, n?, fill?, partitionBy?, orderBy? }', doc: 'as: new column; n: rows forward (default 1).' },
    ],
    returns: 'Row[] with the shifted column.',
    examples: ['lead(rows, "status", { as: "next_status", partitionBy: "customer", orderBy: "month" })'],
  },
  {
    name: 'scan',
    kind: 'window',
    summary: 'Add one column per running fold (cumsum/cummax/cummin/runningMean/ema), computed within each partition in order.',
    params: [
      rows,
      { name: 'spec', type: 'Record<string, ScanOp>', doc: 'newColumn → running fold.' },
      { name: 'opts', type: '{ partitionBy?, orderBy? }', doc: 'Partition + order for the scan.', optional: true },
    ],
    returns: 'Row[] with the running columns.',
    examples: ['scan(rows, { running_arr: cumsum("arr") }, { orderBy: "month" })'],
  },
  {
    name: 'cumulative',
    kind: 'window',
    summary: 'Alias of scan — reads naturally for cumulative columns.',
    params: [
      rows,
      { name: 'spec', type: 'Record<string, ScanOp>', doc: 'newColumn → running fold.' },
      { name: 'opts', type: '{ partitionBy?, orderBy? }', doc: 'Partition + order.', optional: true },
    ],
    returns: 'Row[] with the running columns.',
    examples: ['cumulative(rows, { total: cumsum("amt") }, { orderBy: "day" })'],
  },
  {
    name: 'cumsum',
    kind: 'window',
    summary: 'Running sum; null until the first finite value, then carried across nulls.',
    params: [col('Column to accumulate.')],
    returns: 'ScanOp for scan/cumulative.',
    examples: ['scan(rows, { rt: cumsum("amount") }, { orderBy: "day" })'],
  },
  {
    name: 'cummax',
    kind: 'window',
    summary: 'Running maximum of the finite values seen so far.',
    params: [col('Column.')],
    returns: 'ScanOp.',
    examples: ['scan(rows, { peak: cummax("mrr") }, { orderBy: "month" })'],
  },
  {
    name: 'cummin',
    kind: 'window',
    summary: 'Running minimum of the finite values seen so far.',
    params: [col('Column.')],
    returns: 'ScanOp.',
    examples: ['scan(rows, { trough: cummin("mrr") }, { orderBy: "month" })'],
  },
  {
    name: 'runningMean',
    kind: 'window',
    summary: 'Running arithmetic mean of the finite values seen so far.',
    params: [col('Column.')],
    returns: 'ScanOp.',
    examples: ['scan(rows, { avg: runningMean("latency") }, { orderBy: "t" })'],
  },
  {
    name: 'ema',
    kind: 'window',
    summary: 'Exponential moving average with smoothing factor alpha (0..1).',
    params: [col('Column.'), { name: 'alpha', type: 'number', doc: 'Smoothing factor in [0,1].' }],
    returns: 'ScanOp.',
    examples: ['scan(rows, { ema: ema("value", 0.3) }, { orderBy: "t" })'],
  },
  {
    name: 'asofJoin',
    kind: 'window',
    summary: 'Bring in the right row whose ordered key is nearest without overshooting (carry-forward across gaps).',
    params: [
      { name: 'left', type: 'Row[]', doc: 'Left rows.' },
      { name: 'right', type: 'Row[]', doc: 'Right rows.' },
      {
        name: 'opts',
        type: '{ on?, match, direction? }',
        doc: 'on: exact keys; match: ordered key; direction: backward|forward.',
        enum: ['backward', 'forward'],
      },
    ],
    returns: 'Row[] — left rows with the matched right columns (null on a miss).',
    examples: ['asofJoin(invoices, fx, { on: "currency", match: "month" }) // FX carry-forward'],
  },

  // --- dates ---------------------------------------------------------------------
  {
    name: 'monthKey',
    kind: 'date',
    summary: 'The "YYYY-MM" month key for a date — the canonical monthly group key.',
    params: [{ name: 'date', type: 'string | Date', doc: 'ISO date or Date (read in UTC).' }],
    returns: 'string "YYYY-MM".',
    examples: ['groupBy(derive(rows, { month: r => monthKey(r.signed_at) }), "month")'],
  },
  {
    name: 'truncate',
    kind: 'date',
    summary: 'Truncate a date to the start of its year, month, or day.',
    params: [
      { name: 'date', type: 'string | Date', doc: 'ISO date or Date.' },
      { name: 'unit', type: 'string', doc: 'Truncation unit.', enum: ['year', 'month', 'day'] },
    ],
    returns: 'A normalized date string.',
    examples: ['truncate("2026-06-14", "month") // "2026-06"'],
  },
  {
    name: 'addMonths',
    kind: 'date',
    summary: 'Shift by whole months, preserving granularity and clamping the day to the target month.',
    params: [
      { name: 'date', type: 'string | Date', doc: 'ISO date or Date.' },
      { name: 'n', type: 'number', doc: 'Months to add (may be negative).' },
    ],
    returns: 'A date string of the same granularity.',
    examples: ['addMonths("2024-01-31", 1) // "2024-02-29"'],
  },
  {
    name: 'addDays',
    kind: 'date',
    summary: 'Shift by whole days (UTC); always returns "YYYY-MM-DD".',
    params: [
      { name: 'date', type: 'string | Date', doc: 'ISO date or Date.' },
      { name: 'n', type: 'number', doc: 'Days to add (may be negative).' },
    ],
    returns: 'string "YYYY-MM-DD".',
    examples: ['addDays("2026-01-01", -1) // "2025-12-31"'],
  },
  {
    name: 'monthsBetween',
    kind: 'date',
    summary: 'Whole calendar months from a to b (positive when b is later).',
    params: [
      { name: 'a', type: 'string | Date', doc: 'Start date.' },
      { name: 'b', type: 'string | Date', doc: 'End date.' },
    ],
    returns: 'number of months (signed).',
    examples: ['monthsBetween(r.signup, r.month) // months-since for a cohort'],
  },
  {
    name: 'fiscalPeriod',
    kind: 'date',
    summary: 'Fiscal year + quarter for a date, for a fiscal year beginning in startMonth.',
    params: [
      { name: 'date', type: 'string | Date', doc: 'ISO date or Date.' },
      { name: 'opts', type: '{ startMonth? }', doc: 'First month of the fiscal year (1..12, default 1).', optional: true },
    ],
    returns: '{ fiscalYear, quarter, label }.',
    examples: ['fiscalPeriod("2026-04-01", { startMonth: 4 }) // FY2026 Q1'],
  },
  {
    name: 'resolveRange',
    kind: 'date',
    summary: 'Resolve a relative range spec against an explicit now into { start, end } days.',
    params: [
      { name: 'spec', type: 'string', doc: 'last-Nd | last-Nm | ytd | mtd | qtd.' },
      { name: 'now', type: 'string | Date', doc: 'The reference date (a declared params.now).' },
    ],
    returns: '{ start, end } as "YYYY-MM-DD".',
    examples: ['resolveRange("last-90d", now)'],
  },

  // --- null semantics ------------------------------------------------------------
  {
    name: 'coalesce',
    kind: 'null',
    summary: 'First present (non-null, non-undefined) argument, else null.',
    params: [{ name: 'values', type: '...Value', doc: 'Candidates in preference order.' }],
    returns: 'The first present value, or null.',
    examples: ['coalesce(r.override, r.computed, 0)'],
  },
  {
    name: 'orElse',
    kind: 'null',
    summary: 'value if present, otherwise fallback (the two-argument coalesce).',
    params: [
      { name: 'value', type: 'Value', doc: 'Primary value.' },
      { name: 'fallback', type: 'Value', doc: 'Used when value is null/undefined.' },
    ],
    returns: 'value or fallback.',
    examples: ['orElse(r.region, "unknown")'],
  },
  {
    name: 'safeDiv',
    kind: 'null',
    summary: 'Division that yields null on ÷0 or a non-finite/absent operand (never Infinity/NaN).',
    params: [
      { name: 'a', type: 'Value', doc: 'Numerator.' },
      { name: 'b', type: 'Value', doc: 'Denominator.' },
    ],
    returns: 'number | null.',
    examples: ['safeDiv(churned, starting) // gross churn %, null when starting is 0'],
  },

  // --- registration constructors -------------------------------------------------
  {
    name: 'cell',
    kind: 'constructor',
    summary: 'Register a formula cell: doc (intent), declared inputs, and a pure formula.',
    params: [
      {
        name: 'init',
        type: '{ doc, inputs?, formula }',
        doc: 'doc: one-line intent; inputs: local name → path; formula: ({inputs}) => value.',
      },
    ],
    returns: 'CellDef.',
    examples: [
      'export const by_month = cell({ doc: "Monthly revenue", inputs: { orders: "feeds.orders" }, formula: ({ orders }) => table(orders).groupBy("month").rollup({ revenue: sum("eur") }).rows() })',
    ],
  },
  {
    name: 'testCell',
    kind: 'constructor',
    summary: 'Register a test cell with a mandatory kind label and exactly one of expect | relation.',
    params: [
      {
        name: 'init',
        type: '{ kind, subject, inputs?, expect?, relation? }',
        doc: 'kind label; subject cell; expect(ctx)=>TestResult OR a metamorphic relation.',
        enum: ['characterization', 'specification', 'metamorphic', 'property'],
      },
    ],
    returns: 'TestCellDef.',
    examples: [
      'testCell({ kind: "metamorphic", subject: "revenue.by_month", inputs: { orders: "fixtures.orders" }, relation: permutationInvariance({ over: "orders" }) })',
    ],
  },

  // --- test assertions -----------------------------------------------------------
  {
    name: 'expectEqual',
    kind: 'testing',
    summary: 'Assert deep structural equality; returns a pass/fail record.',
    params: [
      { name: 'actual', type: 'Value', doc: 'Computed value.' },
      { name: 'expected', type: 'Value', doc: 'Expected value.' },
    ],
    returns: 'TestResult.',
    examples: ['expect: ({ result }) => expectEqual(result.length, 12)'],
  },
  {
    name: 'expectClose',
    kind: 'testing',
    summary: 'Assert two numbers are within abs or rel·|expected| tolerance.',
    params: [
      { name: 'actual', type: 'Value', doc: 'Computed number.' },
      { name: 'expected', type: 'Value', doc: 'Expected number.' },
      { name: 'tol', type: '{ rel?, abs? }', doc: 'Tolerance; exact if omitted.', optional: true },
    ],
    returns: 'TestResult.',
    examples: ['expect: ({ result }) => expectClose(result.revenue, 48_120, { rel: 0.01 })'],
  },

  // --- relations -----------------------------------------------------------------
  {
    name: 'conservation',
    kind: 'relation',
    summary: 'Row reconciliation: the component columns sum to the equals column (the MRR waterfall).',
    params: [
      {
        name: 'spec',
        type: '{ components, equals, tol? }',
        doc: 'components: columns that must sum; equals: the total column.',
      },
    ],
    returns: 'Relation (use as a testCell relation).',
    examples: [
      'conservation({ components: ["start","new","expansion","contraction","churned","reactivation"], equals: "end" })',
    ],
  },
  {
    name: 'permutationInvariance',
    kind: 'relation',
    summary: 'The result must not change when the rows of an input are reordered.',
    params: [{ name: 'spec', type: '{ over }', doc: 'The input whose row order must not matter.' }],
    returns: 'Relation.',
    examples: ['permutationInvariance({ over: "orders" })'],
  },
  {
    name: 'scaleInvariance',
    kind: 'relation',
    summary: 'Scaling an input by k scales the result by k (use only when the output is linear in it).',
    params: [
      { name: 'spec', type: '{ over, by, tol? }', doc: 'over: input to scale; by: factor.' },
    ],
    returns: 'Relation.',
    examples: ['scaleInvariance({ over: "orders", by: 2 })'],
  },
  {
    name: 'property',
    kind: 'relation',
    summary: 'A caller-stated invariant: predicate(result, inputs) holds.',
    params: [
      { name: 'name', type: 'string', doc: 'What the property asserts.' },
      { name: 'predicate', type: '(result, inputs) => boolean | TestResult', doc: 'The invariant.' },
    ],
    returns: 'Relation.',
    examples: ['property("retention never exceeds 100%", r => r.every(x => x.pct <= 1))'],
  },
];

/** The self-description catalog, keyed by callable name. */
export const catalog: Record<string, SelfDescription> = Object.freeze(
  Object.fromEntries(entries.map((e) => [e.name, e])),
);

/** Callable names in the catalog. */
export const catalogNames: string[] = entries.map((e) => e.name);
