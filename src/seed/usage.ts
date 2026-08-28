// The bundled usage workbook (PLATFORM_TELEMETRY_SPEC §13's dogfood layer, roadmap
// R3-349) — the product questions over the platform's first-party rollup endpoint,
// opened with `?doc=usage`. The five rollup feeds + the meta feed are app-supplied
// runtime feeds (`src/app/usageFeeds.ts`), the same pattern as Meridian's live demo
// feed; the document itself is plain worksheet + template, engine-confined like any
// other.
//
// The worksheet is deliberately DIMENSION-DEFENSIVE: the endpoint serves cells as a
// flat bag of dimension values plus a count, and the exact cut per rollup belongs to
// the materialisation job, not to this document. Every formula therefore groups by
// `day` (the one dimension the read path guarantees) or by "everything except
// day/count", so a re-cut rollup changes the labels, never breaks the report.

export const USAGE_ROOT = 'usage';

const manifest = {
  format: 1,
  compat: { stdlib: '>=0.1.0', catalog: '>=0.1.0' },
  authoredWith: { app: 'reckoner', stdlib: '0.1.0', catalog: '0.1.0' },
  worksheets: ['usage'],
  params: {} as Record<string, never>,
  title: 'immediately.run — usage',
};

const usageSheet = `import { cell, testCell, property } from "@reckoner/stdlib";

// Feed externals are absent until the first frame lands; every formula treats that as
// an empty dataset rather than an error (failure is a normal state for a polled feed).
const rowsOf = (raw) => (Array.isArray(raw) ? raw : []);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// A cell's label: every dimension except day/count, joined. Robust to whatever cut the
// materialisation job chose for this rollup.
const labelOf = (row) => {
  const parts = [];
  for (const k of Object.keys(row)) {
    if (k !== "day" && k !== "count") parts.push(String(row[k]));
  }
  return parts.length ? parts.join(" / ") : "(all)";
};

const sumBy = (raw, keyOf) => {
  const acc = Object.create(null);
  for (const r of rowsOf(raw)) {
    const k = keyOf(r);
    acc[k] = (acc[k] || 0) + num(r.count);
  }
  return acc;
};

const byDay = (raw) =>
  Object.entries(sumBy(raw, (r) => String(r.day || "unknown")))
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

const byLabel = (raw, top) =>
  Object.entries(sumBy(raw, labelOf))
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);

const total = (raw) => rowsOf(raw).reduce((s, r) => s + num(r.count), 0);

export const runs_by_day = cell({
  doc: "App runs per day, summed across every dimension the rollup carries",
  inputs: { raw: "feeds.repos_daily" },
  formula: ({ raw }) => byDay(raw),
});

export const top_repos = cell({
  doc: "Most-run repositories in the window. Public coordinates only — private and local repositories are never collected, so they cannot appear here",
  inputs: { raw: "feeds.repos_daily" },
  formula: ({ raw }) => byLabel(raw, 10).map((r) => ({ repository: r.label, runs: r.count })),
});

export const runs_total = cell({
  doc: "Total recorded runs in the window",
  inputs: { raw: "feeds.repos_daily" },
  formula: ({ raw }) => total(raw),
});

export const geo_regions = cell({
  doc: "Runs by geography (country/region and device class as the rollup cuts it)",
  inputs: { raw: "feeds.geography_daily" },
  formula: ({ raw }) => byLabel(raw, 12).map((r) => ({ where: r.label, count: r.count })),
});

export const users_by_week = cell({
  doc: "Signed-in daily users per week — the pseudonym is uid-derived, so this describes the signed-in minority only",
  inputs: { raw: "feeds.retention_weekly" },
  formula: ({ raw }) => byDay(raw),
});

export const llm_by_day = cell({
  doc: "LLM calls per day",
  inputs: { raw: "feeds.llm_daily" },
  formula: ({ raw }) => byDay(raw),
});

export const llm_split = cell({
  doc: "LLM calls by model / latency band, as the rollup cuts it",
  inputs: { raw: "feeds.llm_daily" },
  formula: ({ raw }) => byLabel(raw, 10),
});

export const llm_total = cell({
  doc: "Total LLM calls in the window",
  inputs: { raw: "feeds.llm_daily" },
  formula: ({ raw }) => total(raw),
});

export const contrib_by_day = cell({
  doc: "Contributions per day (the denominator question is still an owner decision; this chart is counts, not shares)",
  inputs: { raw: "feeds.contribution_daily" },
  formula: ({ raw }) => byDay(raw),
});

export const contrib_total = cell({
  doc: "Total contributions in the window",
  inputs: { raw: "feeds.contribution_daily" },
  formula: ({ raw }) => total(raw),
});

export const feed_health = cell({
  doc: "Latest fetch outcome per rollup: status, served cells, and server-side suppression. Suppression is reported because a hidden zero is itself a signal",
  inputs: { raw: "feeds.usage_meta" },
  formula: ({ raw }) => rowsOf(raw),
});

export const suppressed_total = cell({
  doc: "Cells withheld server-side for being under the k-floor, across all rollups",
  inputs: { raw: "feeds.usage_meta" },
  formula: ({ raw }) => rowsOf(raw).reduce((s, r) => s + num(r.suppressed), 0),
});

export const counts_nonneg = testCell({
  kind: "property",
  subject: "usage.runs_by_day",
  relation: property("per-day counts are non-negative", (result) =>
    Array.isArray(result) && result.every((r) => r.count >= 0)),
});

export const suppression_nonneg = testCell({
  kind: "property",
  subject: "usage.suppressed_total",
  relation: property("suppressed cell count is a non-negative number", (result) =>
    typeof result === "number" && result >= 0),
});
`;

const usageTemplate = `Platform usage for immediately.run, read from the first-party analysis endpoint —
materialised rollups only, with the k-anonymity floor applied server-side before
anything reaches this report. Boot health and error rates are deliberately absent:
operational monitoring stays in BigQuery, because a site app cannot report that the
site failed to boot.

<Row>
<Kpi source="usage.runs_total" format="number" />
<Kpi source="usage.llm_total" format="number" />
<Kpi source="usage.contrib_total" format="number" />
</Row>

## Runs per day.

<Chart source="usage.runs_by_day" kind="line" x="day" y="count" />

## Most-run repositories.

Public coordinates only — private and local repositories are never collected, so they
cannot appear here.

<Table source="usage.top_repos" columns={["repository", "runs"]} sortable />

## Geography and device.

<Chart source="usage.geo_regions" kind="bar" x="where" y="count" />

## Signed-in daily users, per week.

The cross-day pseudonym is uid-derived, so this series describes the signed-in
minority, not all visitors.

<Chart source="usage.users_by_week" kind="line" x="day" y="count" />

## LLM usage.

<Row>
<Chart source="usage.llm_by_day" kind="bar" x="day" y="count" />
<Chart source="usage.llm_split" kind="pie" value="count" label="label" />
</Row>

## Contributions.

<Chart source="usage.contrib_by_day" kind="bar" x="day" y="count" />

## Feed health.

Each rollup's latest fetch, with server-side suppression reported rather than hidden —
a hidden zero is itself a signal. Cells under the k-floor were withheld before serving:

<Value source="usage.suppressed_total" />

in total. A status of "forbidden" means this app holds no grant for the analysis
origin; "http-503" or "network" means the endpoint is unreachable or not yet deployed.

<Table source="usage.feed_health" columns={["rollup", "status", "cells", "suppressed", "kFloor", "from", "to"]} sortable />
`;

/** The document as an in-memory file map, keyed by document-root-relative path. */
export const USAGE_FILES: Record<string, string> = {
  'usage/reckoner.json': JSON.stringify(manifest),
  'usage/worksheets/usage.sheet.js': usageSheet,
  'usage/templates/usage.mdx': usageTemplate,
};
