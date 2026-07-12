// The bundled demo document (ARCHITECTURE_PLAN §3, §7). Reckoner is normally opened *on* a
// document living in a mount; so the app renders something with zero prompts, it ships one
// self-contained example — the Meridian monthly review — as an in-memory document the real
// `loadDocument` loader reads through an injected reader (src/app/memoryReader.ts).
//
// PORTABILITY: the files are plain string/object constants, NOT Vite `?raw` / `import.meta.glob`
// imports — those are bundler-specific and would break on immediately.run (the "works in vite,
// breaks on the platform" trap). The worksheet is plain `.sheet.js` (executed in the engine's
// SES compartment) and the template is the MDX subset (parsed by src/report/parse).

import { execSummary, mrrMovements, regionCustomers, cohortRetention } from './data.ts';
import type { Value } from '../stdlib/types.ts';

export const SEED_ROOT = 'meridian';

const manifest = {
  format: 1,
  compat: { stdlib: '>=0.1.0', catalog: '>=0.1.0' },
  authoredWith: { app: 'reckoner', stdlib: '0.1.0', catalog: '0.1.0' },
  worksheets: ['review'],
  params: { span: '12m' } as Record<string, Value>,
  title: 'Meridian — monthly review',
};

// The formula worksheet: plain JS registering cells; imports resolve only to the stdlib, which
// the engine's compartment endows. Light shaping over the frozen fixtures — the real port of
// the Meridian MRR waterfall/cohort pivot is M2 work; here we prove the runnable pipeline.
const reviewSheet = `import { cell, table } from "@reckoner/stdlib";

export const total = cell({
  doc: "Latest monthly recurring revenue, EUR",
  inputs: { rows: "fixtures.exec_summary" },
  formula: ({ rows }) => (rows.length ? rows[rows.length - 1].mrr : null),
});

export const total_prev = cell({
  doc: "Prior-month MRR, EUR — the KPI compare baseline",
  inputs: { rows: "fixtures.exec_summary" },
  formula: ({ rows }) => (rows.length > 1 ? rows[rows.length - 2].mrr : null),
});

export const nrr = cell({
  doc: "Latest net revenue retention, as a ratio",
  inputs: { rows: "fixtures.exec_summary" },
  formula: ({ rows }) => (rows.length ? rows[rows.length - 1].nrrPct / 100 : null),
});

export const churn = cell({
  doc: "Latest gross revenue churn, as a ratio",
  inputs: { rows: "fixtures.exec_summary" },
  formula: ({ rows }) => (rows.length ? rows[rows.length - 1].grossChurnPct / 100 : null),
});

export const by_month = cell({
  doc: "MRR by month for the trend line, windowed by the span param",
  inputs: { rows: "fixtures.exec_summary", span: "params.span" },
  formula: ({ rows, span }) => {
    const n = span === "6m" ? 6 : rows.length;
    return table(rows)
      .sort("month")
      .derive({ mrr: (r) => r.mrr })
      .rows()
      .slice(-n)
      .map((r) => ({ month: r.month, mrr: r.mrr }));
  },
});

export const growth_stack = cell({
  doc: "Monthly growth composition (new/expansion/reactivation), long format for a stacked bar",
  inputs: { rows: "fixtures.mrr_movements" },
  formula: ({ rows }) =>
    rows.flatMap((r) => [
      { month: r.month, driver: "new", value: r.newMrr },
      { month: r.month, driver: "expansion", value: r.expansion },
      { month: r.month, driver: "reactivation", value: r.reactivation },
    ]),
});

export const latest_growth = cell({
  doc: "Latest-month growth drivers, for the composition pie",
  inputs: { rows: "fixtures.mrr_movements" },
  formula: ({ rows }) => {
    const r = rows.length ? rows[rows.length - 1] : {};
    return [
      { driver: "new", value: r.newMrr || 0 },
      { driver: "expansion", value: r.expansion || 0 },
      { driver: "reactivation", value: r.reactivation || 0 },
    ];
  },
});

export const by_region = cell({
  doc: "Active customers by region, for the map breakdown",
  inputs: { rows: "fixtures.region_customers" },
  formula: ({ rows }) => rows.map((r) => ({ region: r.region, customers: r.customers })),
});

export const cohort_curves = cell({
  doc: "Retention % by months-since-signup, per cohort, for the small multiples",
  inputs: { rows: "fixtures.cohort_retention" },
  formula: ({ rows }) => rows.map((r) => ({ cohort: r.cohort, offset: r.offset, retention: r.retentionPct })),
});

export const movements = cell({
  doc: "MRR movement waterfall by month, for the detail table",
  inputs: { rows: "fixtures.mrr_movements" },
  formula: ({ rows }) => rows,
});

export const live_by_region = cell({
  doc: "Active sessions per region right now, from the live feed",
  inputs: { rows: "feeds.live_regions" },
  formula: ({ rows }) => (Array.isArray(rows) ? rows : []),
});
`;

// The report template — the MDX subset. Exercises the breadth of the catalog: KPIs (currency +
// percent), a line trend, a stacked bar, a pie, a map, a callout, faceted retention curves, a
// sortable table, a param widget, and an inline bound value.
const weeklyTemplate = `Recurring-revenue health for Meridian SaaS. Pick a window and the whole report
recomputes — every figure below is derived from the frozen fixtures by the engine.

<Params>
<Select name="span" options={["12m", "6m"]} default="12m" />
</Params>

<Row>
<Kpi source="review.total" compare="review.total_prev" format="currency" />
<Kpi source="review.nrr" format="percent" />
<Kpi source="review.churn" format="percent" />
</Row>

## MRR trend.

<Chart source="review.by_month" kind="line" x="month" y="mrr" />

## Growth composition.

New, expansion and reactivation MRR by month.

<Chart source="review.growth_stack" kind="bar" x="month" y="value" color="driver" stack="stacked" />

<Row>
<Chart source="review.latest_growth" kind="pie" value="value" label="driver" />
<Map source="review.by_region" kind="choropleth" region="region" value="customers" />
</Row>

<Callout tone="info">
Net revenue retention and gross churn are the two levers behind the trend above — watch them together.
</Callout>

## Live activity.

Active sessions per region, streaming from a live feed — this chart recomputes on every frame.

<Chart source="review.live_by_region" kind="bar" x="region" y="sessions" />

## Cohort retention.

Retention curves by signup cohort — each panel is one cohort's decay.

<Facets source="review.cohort_curves" by="cohort">
<Chart kind="line" x="offset" y="retention" />
</Facets>

## Movement detail.

<Table source="review.movements" columns={["month", "newMrr", "expansion", "contraction", "churned", "endMrr"]} sortable />
`;

const provenance = { sourceFeed: 'meridian', capturedAt: '2026-07-09', captureActor: 'generate.py', synthetic: true };
const frame = (rows: unknown): string => JSON.stringify({ rows, provenance, tier: 'static' });

/** The document as an in-memory file map, keyed by document-root-relative path. */
export const SEED_FILES: Record<string, string> = {
  'meridian/reckoner.json': JSON.stringify(manifest),
  'meridian/worksheets/review.sheet.js': reviewSheet,
  'meridian/templates/weekly.mdx': weeklyTemplate,
  'meridian/fixtures/exec_summary.frame.json': frame(execSummary),
  'meridian/fixtures/mrr_movements.frame.json': frame(mrrMovements),
  'meridian/fixtures/region_customers.frame.json': frame(regionCustomers),
  'meridian/fixtures/cohort_retention.frame.json': frame(cohortRetention),
};
