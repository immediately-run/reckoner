# Reckoner — Architecture Plan

**Status:** plan / draft — scope decisions made 2026-07-09 (recorded in §1); design mechanisms adopted from `reckoner_research_report_v2.md`; nothing here is built · **Updated:** 2026-07-09

> **Drafted for:** peter@peterneumark.com
>
> **Reads first:** [product_definition.md](product_definition.md) (what Reckoner is),
> [problem_statement.md](problem_statement.md) (the three hard problems),
> [research_proposal.md](research_proposal.md) (RQ numbering used throughout),
> [reckoner_research_report_v2.md](reckoner_research_report_v2.md) (the findings this plan
> adopts — cited as "report §…"), and the platform spec
> [REPORTING_SPREADSHEET_SPEC.md](REPORTING_SPREADSHEET_SPEC.md) (canonical:
> `docs/specs/REPORTING_SPREADSHEET_SPEC.md` — cited as "spec §…"). Platform siblings:
> `TRUST_MODES_SPEC.md` §5/§5.1, `AGENT_AUTHORING_ARCHITECTURE.md` §0/§5.1 (AA-01),
> `STANDING_APP_LIFECYCLE_SPEC.md` §5/§5.1, `UI_AS_APPS_SPEC.md` §8.11.

This document turns the research report's recommendations plus the product decisions of
2026-07-09 into a concrete architecture and build plan: system decomposition, document
model, the design of each realm, the platform workstream this program owns, milestones with
gates, and the experiments still booked. It deliberately does **not** relitigate anything
the platform spec's §9 or the report already closed; where a mechanism is adopted, the plan
cites the finding and moves on.

---

## 1. Product decisions recorded (2026-07-09)

Six scope decisions were made in the planning session. They are recorded here with their
consequences, so later work does not re-open them casually — re-opening any of these is a
product decision, not an engineering one.

| # | Decision | Chosen | Consequence the plan owns |
|---|---|---|---|
| PD-1 | v1 data scope | **Full live streaming** (static + pulled + live) | v1 sits on **all** of the platform spec's §8 unbuilt deltas, including the undesigned Q3 egress-fixing. Mitigation: milestone gating (§10) — the static path comes up first and live/shared ships only behind the spec's gate tests. |
| PD-2 | Embedded assistant | **In v1** | The fourth realm (Class-A agent) is a v1 deliverable, including the live-vs-gated write legibility (spec RB-9) and the infer-then-fortify authoring loop (§8). |
| PD-3 | Report generation | **In v1** | The F2/F3 generation pipeline ships in v1 — but the report's sequencing constraint is preserved *inside* v1: the F4 judge-agreement harness is built first (M0) and generation-quality claims are gated on measured per-dimension κ (§8.4, §10). |
| PD-4 | Formula surface | **Committed now**: minimal JS core + typed shaping stdlib, fluent dataframe as sugar over the same core (report RQ-A1) | The A1 bake-off still runs (M0) but as *validation*, with the report's written promotion rule: SQL-hybrid is promoted to a co-equal surface only if it shows ≥10 pts higher first-attempt correctness **and** comparable diff auditability. |
| PD-5 | Platform deltas | **In-program** — this program builds them | The plan books concrete workstreams in `immediately-run-site-main`, `sandbox`, and `immediately-run-sdk` (§9), each with the spec's gate test as exit criterion. Reckoner is the forcing function *and* the delivery vehicle. |
| PD-6 | Repo topology | **One repo (`reckoner`), realms as sibling entry points; AA-01 booked as an in-program dependency** | AA-01 (program-identity `appKey`, `AGENT_AUTHORING §5.1`) becomes the **seventh** platform delta this program owns. **Honesty note:** until AA-01 lands, all entry points in one repo share an `appKey`, so realm grant isolation is *fiction* — acceptable for development, and a hard gate before anything shared or live ships (§9, §10). |

**The honest one-line consequence of PD-1/PD-5/PD-6:** this is a two-track program. Track 1
is the Reckoner app; Track 2 is seven platform deltas (six from spec §8 plus AA-01), one of
which (Q3 egress-fixing) is not merely unbuilt but **undesigned**. Track 2's Q3 design
sprint is therefore the first platform work item (§10 M0), because it is the single most
load-bearing gap (spec §4.5) and its design could plausibly force changes elsewhere.

**Standing on unbuilt platform functionality is not a defect of this plan — it is the
point.** Reckoner is deliberately the **forcing function** for these platform capabilities
(the platform spec's own framing, spec §0): each delta gets designed and built against a
real, demanding consumer rather than speculatively, which is how the platform avoids
shipping security machinery whose requirements were guessed. The milestone gates in §10
exist to sequence that forcing honestly (nothing shared ships before its backstops), not to
hedge against the dependency itself.

---

## 2. System overview

### 2.1 The five parts

Reckoner is a composite of four sandboxed realms plus the host-owned safe renderer
(spec §2). Nothing in this plan changes that shape; this section maps it onto repos,
entry points, and build order.

```
                        ┌────────────────────────────────────────────┐
                        │ reckoner repo (one repo, PD-6)             │
                        │                                            │
   viewer ──────────────► src/App.tsx          REPORT VIEW (root)    │
                        │   renders templates via the SDK safe       │
                        │   renderer; holds rw@self + feed-read      │
                        │                                            │
                        │ src/entry/engine.tsx  FORMULA ENGINE       │
                        │   SES compartment; executes formulas +     │
                        │   tests; holds NOTHING                     │
                        │                                            │
                        │ src/entry/connector.tsx  DATA CONNECTOR    │
                        │   config-driven fetch; secrets:use +       │
                        │   net:fetch (egress-fixed); no content     │
                        │   execution, no agent                      │
                        │                                            │
                        │ src/entry/assistant.tsx  ASSISTANT         │
                        │   G12 agent; llm:chat + rw@self;           │
                        │   Class-A catalog only                     │
                        └────────────────────────────────────────────┘
                                     │ distinct appKeys per entry point = AA-01
                                     ▼
                        host: composite manifest resolution, powerbox,
                        tiered mounts, egress proxy, safe renderer (SDK)
```

- **Report view** is the repo's root app (`src/App.tsx`) and the composite root. It is an
  interpreter: it renders templates and live results and executes no content code. All
  template rendering goes through the SDK's non-executable-MDX safe renderer (platform
  delta D3, §9).
- **Formula engine** is a sibling entry point hosting a SES (Hardened JavaScript)
  compartment. It executes worksheet modules and formulas. It requests **no capabilities**;
  its only channels are the host-brokered input injection and the tiered result/diagnostic
  output channels.
- **Data connector** is a sibling entry point. It is a dumb pipe: feed *configuration*
  decides what is fetched from where; fetched bytes are materialized to a host-tiered mount
  and never influence subsequent fetches (spec §4.5). It holds the composite's only
  dangerous capabilities, bounded by the host egress proxy (D2, §9).
- **Assistant** is a sibling entry point embedding the platform agent harness
  (`agent-demo`/G12 pattern): its tool list is the grant-filtered catalog, which is
  Class-A-scoped by construction.
- **Safe renderer** is not Reckoner code at all — it is an SDK deliverable (D3) that the
  report view consumes.

### 2.2 Composite manifest

`package.json` carries the composite declaration exactly as spec §6.1 shapes it: members
are binding-resolved **roles** with default refs pointing at this repo's sibling entry
points, never pinned app refs. `capsEnvelope` is declared for legibility (powerbox
attribution), never treated as enforcement (spec RB-1).

```jsonc
"immediately.run": {
  "composite": {
    "name": "Reckoner",
    "role": "report-view",
    "members": [
      { "role": "formula-engine", "contract": "ir.evaluate@1", "defaultRef": "<this repo>#entry/engine",    "capsEnvelope": [] },
      { "role": "data-connector", "contract": "ir.feed@1",     "defaultRef": "<this repo>#entry/connector", "capsEnvelope": ["net:fetch", "secrets:use"] },
      { "role": "assistant",      "contract": "ir.assist@1",   "defaultRef": "<this repo>#entry/assistant", "capsEnvelope": ["llm:chat", "worktree:rw@self"] }
    ]
  }
}
```

The `<this repo>#entry/…` ref form is the AA-01-dependent piece: it requires the host to
mint a distinct program identity (`appKey`) per entry point. Until AA-01 lands the host
would key all four on one `appKey`; the plan treats that state as **dev-only** (§10).

### 2.3 App code vs. content

The deployment continuum (spec §1) is preserved: Reckoner app code (this repo) is FS1;
the document — workbook, templates, feeds config, fixtures — is FS2 content living in a
space or repo mount. Everything in §3 below describes **content**, not app source. The
fused shape (content embedded in a fork) needs no extra machinery: the document directory
simply lives inside the app repo.

---

## 3. Document model — the file formats

Everything an agent or human needs is plain files (product definition: "no opaque binary
document format"). The formats below are the contract between all four realms and the
primary agent-facing surface, so they are designed for: diffability, explicit dependency
declaration (report RQ-A2), test-kind labeling (report workstream D), and tier tags that
cannot be self-assigned by content (tier tags in files are advisory display metadata; the
**host's** mount tier is authoritative — see §5.4).

```
my-dashboard/                     # the document root (a mount: space, repo dir, or app-embedded)
  reckoner.json                   # document manifest: format version, worksheet order, param defaults
  worksheets/
    revenue.sheet.js              # cells: formulas + tests (content, executed only in the engine)
    churn.sheet.js
  feeds/
    orders.feed.json              # connector config — trusted config, not content (spec §4.5)
  fixtures/
    orders.2026-06.frame.json     # frozen frames: data + captured-at + source feed + tier tag
  templates/
    weekly.mdx                    # non-executable MDX subset
    ops.mdx
```

### 3.1 Worksheets and cells — the formula syntax

A worksheet is a JS module **evaluated only inside the engine's SES compartment**. Module
evaluation *is* content execution, which is exactly what the engine realm exists to do. The
module registers cells declaratively; the engine extracts the dependency graph from the
registrations and publishes it (names + declared inputs only, no values) to the scheduler.
Imports resolve only to `@reckoner/stdlib` (the compartment controls module resolution).

Each cell is a named export created by one constructor, with a three-part shape — `doc`,
`inputs`, `formula` — that follows directly from report RQ-A1/A2:

```js
// worksheets/revenue.sheet.js
import { cell, testCell, table, sum, conservation, permutationInvariance,
         expectClose } from "@reckoner/stdlib";

export const by_month = cell({
  doc: "Monthly revenue, EUR-normalized",
  inputs: {
    orders: "feeds.orders",        // local name → declared path
    fx:     "static.fx_rates",
    region: "params.region",
  },
  formula: ({ orders, fx, region }) =>
    table(orders)
      .filter(r => region === "all" || r.region === region)
      .join(fx, { on: "currency" })
      .derive({ eur: r => r.amount * r.rate })
      .groupBy("month")
      .rollup({ revenue: sum("eur") })
      .rows(),                     // exits sugar back to plain objects
});
```

Binding rules (all load-bearing, all from the report):

- **`inputs` is an explicit map, and it is the *only* way to see data** (RQ-A2). The
  evaluator injects exactly the declared inputs as frozen, structurally-shared values — an
  undeclared read is *unnameable*: no ambient `cells` object, no globals, no module-scope
  escape (SES lockdown removes the intrinsics). That is what makes Class B unreachable by
  construction and gives the scheduler, taint fold, and test runner an exact dependency
  set. The **object form** (local name → path) rather than a positional array is an
  agent-ergonomics decision: it eliminates the "which positional arg was which"
  mis-serialization failure class (RQ-A5's platform scar tissue).
- **`formula` is a pure function: plain values in, one plain value out.** Return values
  are JSON-ish data (rows as arrays of plain objects, scalars, nested plain structures) —
  never class instances or closures. Plain immutable values are also what makes early
  cutoff cheap (RQ-B1: reference-equality fast path + content hashing), so the syntax
  simply cannot produce un-hashable results.
- **Names, not coordinates.** Cells are referenced `worksheet.cell`; the namespaces are
  `feeds.*`, `fixtures.*`, `static.*`, `params.*`, and `<worksheet>.*`.
- **Purity is layered, not assumed** (RQ-A4): SES `lockdown()` + Compartment (no ambient
  `Date.now`/`Math.random`), frozen inputs, virtualized nondeterminism,
  double-evaluation spot checks in authoring/CI. Accepted residuals per the report: perf
  nondeterminism, float associativity, infinite loops — the last handled by a worker
  watchdog at the engine boundary, not by the language.

**Dynamic dependencies — parameterized, never `INDIRECT()`** (RQ-A2). A formula that needs
"the cell the viewer picked" declares the *selector* as an input and indirects only within
a **declared namespace** — the Shake/Bazel treatment, with Excel's volatile `INDIRECT()`
as the named anti-pattern. The engine computes the conservative dependency set
(`revenue.*`) statically; nothing recalculates every cycle, nothing outside the namespace
is nameable:

```js
export const focus_metric = cell({
  inputs: {
    which:      "params.metric",   // the selector is itself a declared input
    candidates: "revenue.*",       // declared namespace indirection
  },
  formula: ({ which, candidates }) => candidates[which],
});
```

**Feeds and time — declared, snapshotted, windowed** (RQ-A3/A4). A feed is a frozen
snapshot per recalculation — just another input. History is opt-in via an explicit window
declared *at the input site*, never conjured inside the formula; the clock is a cell, not
an ambient API:

```js
export const orders_last_hour = cell({
  inputs: { recent: { feed: "orders", window: "1h" } },  // event-time window over the buffer
  formula: ({ recent }) => recent.length,
});

export const staleness = cell({
  inputs: { now: "params.now", fetched_at: "feeds.orders.meta.fetched_at" },
  formula: ({ now, fetched_at }) => now - fetched_at,
});
```

**Tests are cells with a mandatory `kind`** (RQ-D1 + workstream D preamble). A test's value
is a structured pass/fail record carrying its kind; under infer-then-fortify a green suite
means nothing without the label, because characterization tests pinned from the formula's
own fitting data are green by construction. A cell whose only coverage is such tests
renders as *visibly unvalidated* — the same visual class as untested:

```js
export const by_month_holdout = testCell({
  kind: "specification",           // characterization | specification | metamorphic | property
  subject: "revenue.by_month",
  inputs: { rows: "fixtures.orders_holdout" },   // rows withheld from the fitting context
  expect: ({ result }) =>
    expectClose(result.find(m => m.month === "2026-05").revenue, 48_120, { rel: 0.01 }),
});

export const by_month_conserves = testCell({
  kind: "metamorphic",
  subject: "revenue.by_month",
  inputs: { orders: "fixtures.orders_2026_06", fx: "static.fx_rates" },
  relation: conservation({ of: "revenue", partitionedBy: "month" }),
});

export const by_month_order_free = testCell({
  kind: "metamorphic",
  subject: "revenue.by_month",
  inputs: { orders: "fixtures.orders_2026_06", fx: "static.fx_rates" },
  relation: permutationInvariance({ over: "orders" }),
});
```

### 3.2 The formula API surface (committed, PD-4)

Minimal core: a formula is `({inputs}) => value` over plain JS values. One stdlib, small
enough to hold (**well under 20 top-level callables**, report RQ-A5), additive-only forever:

- **Shaping:** `table()` (the fluent sugar), `groupBy`, `rollup`/`aggregate` (with `sum`,
  `mean`, `median`, `count`, `min`, `max`, `quantile`), `join` (inner/left, explicit
  semantics), `pivot`, `window` (event-time, for feed history), `sort`, `topN` (with
  "other" bucket), `derive`, `filter`.
- **Testing:** `testCell()`, `expectEqual`/`expectClose`, `property()` (PBT),
  `conservation()`, `permutationInvariance()`, `scaleInvariance()` — metamorphic relations
  as named stdlib citizens (report RQ-D5): they are the non-circular correctness evidence
  in a workflow where nobody knows the "true" formula.
- **Screening (assistant-facing, §8.3):** `trend()`, `outliers()`, `deltas()` — the
  computed message-finding tools, themselves pure formulas.

Every callable ships a JSON-Schema-typed self-description with purpose line, per-parameter
descriptions, enums for closed choices, and 1–2 worked examples (RQ-A5); the catalog of
self-descriptions is a first-class evaluated artifact with its own gate test (§11). The
fluent `table()` API is a thin layer over the plain-value core — `table(rows)…rows()` in,
plain rows out; same semantics, no second engine, no separate columnar runtime.

**Deliberately absent — the absences are findings too:**

- **No SQL strings** (RQ-A1): opaque to diff review and the additive-only contract; blurs
  into a query engine.
- **No ambient anything** (RQ-A2/A4): no `fetch`, no `console` (diagnostics go through the
  typed host channel, §4.3), no clock/random, no cell registry.
- **No stateful notebook cells:** a cell cannot assign to another cell or hold state
  across evaluations — that restriction is what keeps recalculation, testing, and trace
  replay sound.
- **No large launch surface** (RQ-A5 + additive-only caveat): a mis-designed stdlib
  function can never be removed, so v1 errs toward too little, not too complete.

This exact surface is what the M0 bake-off (E-1, §11) validates from the self-descriptions
alone, with the written promotion rule if SQL-hybrid wins by ≥10 points.

### 3.3 Templates — the template language

**The substrate: MDX syntax with computation removed.** A template *looks* like MDX —
markdown prose interleaved with JSX-style component tags — but it renders through the
host/SDK **no-acorn render-as-data** safe renderer (spec §3.4, platform delta D3), which
changes what the syntax means:

- **Markdown renders as markdown** — headings, paragraphs, lists, links; the prose layer
  of a report is ordinary writing.
- **Component tags are data, not code:** a tag is parsed to a node (name + attributes);
  the renderer looks the name up in the closed catalog and instantiates the *audited*
  component. The author's document never contributes executable code.
- **Expressions never evaluate.** There is no evaluator in the pipeline: an expression
  body is captured as an inert string (the verified test case: `f={fetch("/x")}` arrives
  as literal text). Same for anything that would be an event handler.
- **No imports/exports/ESM** — the catalog is fixed by the app (or a fork of it).
- **Unknown components render as a safe placeholder** — a visible "this report uses
  `<Timeline>`, which this app doesn't provide" block; never a page-killing error, never
  silent omission. This is also the fork story (spec §3.5): component *definitions* are
  app source (audited by the fork author), component *usages* are content, and a document
  using fork components degrades gracefully in stock Reckoner.
- **Attribute values are literals only:** strings, numbers, booleans, and literal
  arrays/objects (`options={["all","emea"]}` is captured as plain data by the
  render-as-data path). Anything non-literal is inert text.

Opening a stranger's dashboard is therefore safe **by grammar**, not by sandbox heroics.

**Data binding: the `source` attribute.** All data flows through declarative attribute
references resolved by the renderer — never interpolation
(`<Kpi source="revenue.total" />` is the one way to bind; `{cells.revenue.total}` renders
as text). The binding grammar is the formula language's dotted-name namespace:
`worksheet.cell`, `feeds.*` (rare — usually bind the cell that shaped the feed), and
`params.*` (echo a viewer selection in prose via `<Value source="params.region" />`).
Resolution mechanics, all load-bearing:

1. The renderer collects every `source` in the document and subscribes to those names on
   the **host-tiered result channel**. A template's reads are enumerable by inspection —
   it can only display what it names, and the host knows the full set statically.
2. When the engine recomputes a bound cell, the component re-renders. Liveness is entirely
   the binding's doing; the template stays a static document.
3. Values arrive **with their tier**, so shared-view chrome can badge low-trust-derived
   tiles; a template never touches values (only names them), so it cannot launder.
4. **Shape contracts are the component's job** (`Kpi` wants a scalar, `Chart` wants rows
   with the encoded fields); a mis-shaped binding is an authoring-time diagnostic and a
   marked broken tile in view mode — never a blank or a crash.

**The component catalog** (report RQ-F1 — the closed v1 set; typed attributes with enums
for closed choices; responsive reflow, dark/light theming, axis/legend correctness, and
accessible color are built into the components, not author decisions):

| Component | Key attributes | Notes |
|---|---|---|
| `Kpi` | `source`, `compare`, `format`, `spark` | stat card; the "just show the number" form |
| `Chart kind="bar"` | `source`, `x`, `y`, `stack` (`none`/`stacked`/`normalized`), `color` | incl. stacked & 100%-stacked |
| `Chart kind="line"` | `source`, `x`, `y`, `color` | |
| `Chart kind="area"` | as line | |
| `Chart kind="scatter"` | `source`, `x`, `y`, `color`, `size` | |
| `Chart kind="histogram"` | `source`, `value`, `bins` | |
| `Chart kind="pie"` | `source`, `value`, `label` | **≤5 slices enforced** — excess auto-buckets to "other" |
| `Table` | `source`, `columns` (literal list), `sortable` | matrix display |
| `Map kind="choropleth"/"point"` | `source`, `region`/`lat`/`lon`, `value` | |
| `Facets` | `source`, `by`, wraps one `Chart` | small-multiples — the endorsed alternative to cramming series |

Plus: markdown prose, `Callout` (`tone`), `Value` (inline bound scalar), one KPI-style
gauge (the single permitted radial); layout primitives `Section` and `Row` (coarse only —
components own their internal responsive behavior via container queries, RQ-F5: one
template, catalog-owned adaptation; per-form-factor overrides are a per-section escape
hatch); and a `Params` block of input widgets — `Select`, `Toggle`, `Range`, `DateRange`
(each with `name`, typed `options`/bounds, `default`).

**Excluded by construction** (anti-affordances the catalog makes inexpressible): 3D
anything, dual-axis by default, pies beyond 5 slices, radial/gauge beyond the one KPI
gauge, word clouds. Every future addition passes an anti-affordance review.

**Interactivity: widgets write to input cells.** There are no event handlers in the
language; interaction closes a loop through the workbook:

```mdx
<Params>
  <Select name="region" options={["all", "emea", "amer", "apac"]} default="all" />
  <DateRange name="period" default="last-90d" />
</Params>

# Weekly revenue.

Showing <Value source="params.region" /> for <Value source="params.period" />.

<Kpi source="revenue.total" compare="revenue.total_prev" />
<Chart source="revenue.by_month" kind="line" x="month" y="revenue" />
<Facets source="churn.by_cohort" by="cohort">
  <Chart kind="bar" x="month" y="churned" />
</Facets>
```

A widget's `name` designates a `params.*` **input cell**: the viewer picks EMEA → the host
writes `params.region` → every formula that declared it recomputes → every bound component
re-renders. Drill-down, filtering, and re-parameterization are all this one mechanism —
interaction is pure data flow the dependency graph already understands, and viewer actions
can never invoke anything, only change declared inputs. Declared `options`/bounds double
as validation: a widget can only produce values from its literal set.

**Degraded states are component-owned** (RQ-C2): bound cell threw → marked broken tile (no
internals in view mode); unconsented feed → explicit "needs feed access" state with the
consent affordance; aged-out buffer → "data aged out" — never silent wrong data.

**Why this also serves generation** (workstream F): the language is a closed,
deterministic structure — the LLM layout stage picks from audited forms (no escape into
HTML/JS), the mechanical lints (§8.4) are checkable on the parse tree, and "make churn
lead, drop the pie" lands as a small, reviewable diff (RQ-F6).

### 3.4 Feeds and fixtures

`feeds/*.feed.json` is **trusted configuration** (spec §4.5): source URL(s), auth secret
*reference* (never a value), schedule or subscription mode, retention (`keepLast: N` /
`keepFor: T`), conflation interval. Editing a feed file is a config change routed through
the gated write path (§8.2); feed *references* in worksheets are ordinary content.

`fixtures/*.frame.json` are frozen frames: captured rows + provenance (source feed,
captured-at, capture actor) + the frame's tier tag at capture time. Fixture capture **is**
a freeze operation and shares §5.4's machinery and UX. Synthetic fixtures (schema-derived
or second-agent-authored, never generated by running the formula under test) carry a
`synthetic: true` provenance and are clean-tier by construction (report RQ-D4).

---

## 4. The formula engine

The engine is the executor realm: a sibling entry point whose iframe hosts a dedicated
worker; inside the worker, `lockdown()` then one Compartment per document. It holds no
capabilities; every channel is host-brokered.

### 4.1 Evaluation

- **Input injection:** the scheduler resolves a cell's declared inputs to immutable
  snapshots and injects exactly those. Feeds appear as **frozen snapshots per
  recalculation** (RQ-A3) — within one evaluation a feed is an immutable value; history is
  the explicit `window()` abstraction over the connector's retained buffer.
- **Async formulas:** allowed (a formula may return a promise for chunked computation);
  inputs changing mid-flight cancel and reschedule the evaluation (sound because pure —
  Bazel restarting semantics, report RQ-B1).
- **Watchdog:** per-evaluation time budget at the worker boundary; a formula that exceeds
  it is terminated and its cell enters the error state (SES does not protect availability —
  report RQ-A4 residual).
- **Single evaluator context for v1** (RQ-B3). The scheduler is written so independent
  subgraphs *could* be partitioned to a worker pool later, with data movement as
  transferable ArrayBuffers / OPFS — **never** assuming SharedArrayBuffer (the
  `crossOriginIsolated` constraint in opaque-origin sandboxed iframes is architecturally
  fragile; report caveats).

### 4.2 Recalculation scheduler

The report's RQ-B1 recommendation, adopted whole: a **suspending scheduler with verifying
(content-hash) traces and early cutoff** — the Shake/Bazel point in *Build Systems à la
Carte*.

- Immutable snapshots give reference-equality fast paths; content hashing catches
  "recomputed but identical" for early cutoff.
- **The cutoff equality is over the pair `(value-hash, tier)`** — never value alone, or
  early cutoff becomes a tier-laundering hole (RQ-B4). Tier propagates as a second product
  of the same traversal: tier = floor (greatest lower bound) over input *tiers*, so an
  unchanged value with a changed tier still re-labels downstream.
- **Cycles are always an error** with the full cycle path reported (SCC decomposition,
  HyperFormula-style diagnostics); no iterative/fixpoint calc in v1 (RQ-B2 — recorded as a
  known cost for converging financial models; additive opt-in later is compatible).
- Mid-session tier change (a feed's tier drops): flush-then-restart of the affected
  subgraph, softened by cutoff but never below the pair rule.
- Budget (from the research proposal): p95 < 100 ms recompute for a single-cell edit on a
  10⁴-cell workbook; glitch-freedom (no cell ever observes mixed pre/post inputs) proven by
  a property test over random DAGs (§11 E-2).

### 4.3 Diagnostics and debugging across the starved boundary

- **Diagnostics channel (RQ-D2):** the engine's only other output is a host-owned, typed,
  fixed-size, rate-capped, sampled diagnostic record stream (errors with stacks, logs,
  timings). Records inherit the tier of their originating evaluation. Source-map resolution
  happens **host-side** — the compartment never fetches maps. Surfaced in authoring UI
  only, never in shared-view mode.
- **Trace replay (RQ-D3):** authoring mode can record an evaluation (declared inputs →
  stdlib-call intermediates → output) and replay it *outside* the sandbox — sound because
  formulas are pure. This is the primary agent-facing debugging surface (agents consume
  structured traces better than steppers). Layered under it: rich structured errors are
  expected to cover ~90% of need.
- The "debug evaluator with author authority" idea stays **out of plan** until it passes a
  P1 security review (it reintroduces the exact combination the architecture exists to
  prevent).

---

## 5. The data plane

### 5.1 Connector realm

Config-driven pipe: reads `feeds/*.feed.json`, fetches on schedule or holds a
subscription, materializes frames, emits change notifications. It executes no content and
hosts no agent; fetched bytes never determine fetch targets. All egress goes through the
host proxy (D2) — the connector cannot fetch outside its grant-time-bound target list even
if fully compromised (the metacircular-fork containment, spec §3.2).

### 5.2 Ingestion transport (RQ-C1)

v1 = **materialize-to-mount + change notification**: binary/columnar frames written via an
OPFS sync access handle in the connector's worker; a lightweight notification
(BroadcastChannel/postMessage-scale) wakes the scheduler; the engine reads its snapshot.
No message bus in v1. The C1 benchmark (§11 E-4) measures the end-to-end
connector-receipt→chart-paint loop (p95, copy-vs-transfer-vs-OPFS swept) and publishes the
supported envelope ("live means ≤ N Hz / ≤ M KB per feed"); the written trigger for
building the deferred tiered message bus is the envelope failing at ≤30 Hz mid-size frames
(report threshold).

### 5.3 Retention, windows, cadence

- **Connector owns raw retention** (`keepLast`/`keepFor` — the Kafka-retention analogue);
  **formulas own analytical windows** over whatever the buffer holds (RQ-C2). The engine
  statically checks the declarable constraint *buffer ≥ longest dependent window* and
  reports violations at edit time.
- Backgrounded tab / mobile reconnect: rejoin is a fresh subscription with a **gap
  marker**; windows spanning the gap surface as partial, never fabricated continuity.
- **Cadence = conflation** (RQ-C3): coalesce writes per feed (keep-latest), recompute
  immediately on the coalesced frame, align *rendering* to rAF. A stated freshness bound is
  published (conflation interval + one recompute + one paint). No debounce-the-recompute.

### 5.4 Freeze, and fixture capture as freeze (RQ-C4/D4)

Evaluator results are **ephemeral** — rendered live, never silently persisted (spec §5's
RS-10 resolution). The two explicit materialization gestures:

- **Freeze value** (paste-values per cell) and **snapshot workbook** (coarse). Both show
  the tier consequence *before* confirmation ("you are copying elevated-trust data into a
  personal sheet"), and the write refloors the target or is refused — host-enforced by the
  tiered-mount machinery (D4), not by Reckoner's honesty.
- **Fixture capture** is the same operation with a different destination
  (`fixtures/*.frame.json`) and is a **mainline** flow (the infer-then-fortify workflow
  makes it routine, not an edge case — report D4 revision). Captured frames carry their
  source tier; a viewer without feed consent can still run the full test suite over
  fixtures — that is a feature, and the tier tag is what makes it safe.

Because infer-then-fortify makes capture mainline, the freeze UX ships in **M2** (with
authoring), not with the live plane in M3 — the one place this plan re-orders the platform
spec's implied sequence, on the report's explicit recommendation.

---

## 6. Testing architecture

The mainline workflow is **infer-then-fortify** (report workstream D preamble): the
assistant infers a formula from observed data, then fortifies it with tests. This workflow
is structurally circular unless the platform breaks the circle, so the following are core
architecture, not test-infra niceties:

1. **Test-kind labels** (`characterization` / `specification` / `metamorphic` /
   `property`) are mandatory on every test cell (§3.1) and drive the review surface: a
   formula covered only by characterization tests derived from its own fitting data is
   **visibly unvalidated** — a distinct visual state between "untested" and "validated."
2. **Holdout is a first-class affordance.** When the assistant infers a formula from
   column data, the platform withholds a slice of rows from the fitting context and emits
   them as `specification` tests automatically. Held-out rows are the only example-based
   tests carrying genuine correctness weight; the affordance is in the assistant harness
   (§8.3), not left to prompt discipline alone.
3. **Metamorphic relations and PBT are stdlib citizens** (§3.2) — non-circular, oracle-free
   correctness checks that agents state well.
4. **Independent authoring:** the assistant can invoke a second agent that writes
   specification tests and synthetic fixtures from a cell's *stated intent* (its `doc`),
   without seeing the implementation or fitting data.
5. **Mutation testing** is the offline CI signal (Stryker-style over worksheet formulas,
   run outside the browser in CI): does the pinned suite kill mutants? Mutation score per
   cell feeds the review surface.

Tests-as-cells (RQ-D1) means incremental re-run rides the recalc graph for free: editing a
formula re-runs exactly the tests whose transitive inputs changed. A full-workbook test run
is one tool call / one CLI command for agents and CI. Known modeling burden (report
caveat, documented in authoring docs): integration-style tests are cells over declared
inputs, and share the evaluator's watchdog limits.

**Standing honesty rule for the whole feature:** a green suite is not a correctness claim.
The review surface must keep "validated" and "merely pinned" visually distinct, or the
testing story is theater (report caveats).

---

## 7. The report view

The composite root and the only realm a pure viewer ever needs.

- **Run-mode-first (spec RB-5, gate-tested):** a static/in-sheet-only document opens with
  **zero consent prompts on any device** — no powerbox, no connector launch. The composite
  consent appears only when the viewer activates a live feed, and the connector's
  `secrets:use`+`net:fetch` line is an individual, never-bundled consent (RB-3).
- **Rendering:** templates go through the SDK safe renderer (D3); results arrive on the
  host-tiered result channel and are rendered, never persisted (§5.4). Charts are the
  audited catalog components (§3.3) drawing on the design-system tokens; visualization
  styling follows the house dataviz method.
- **Interactivity:** `Params` widgets write to `params.*` input cells; the engine
  recomputes; components re-render. Drill-down is touch-complete (platform value 8).
- **Observability chrome:** the composite inspector integration — per-member status and
  revoke, and the **aggregate reach view** ("9 sources · 2 elevated" badge + consent
  screens showing the *new total*, not the delta — RQ-E3, platform delta D6). The viewer
  trust claim (RQ-E5) ships as report candidate #1: *"Static reports run none of the
  author's code in your browser; live reports fetch only from sources you approve, and
  nothing here can reach your other data."* — written into chrome last, in M4, when it is
  true (research proposal sequencing).

---

## 8. The assistant and the generation pipeline

### 8.1 Confinement

The assistant realm embeds the platform agent harness under G12: its tool list **is** the
grant-filtered catalog, which for this realm is Class-A only — document CRUD (worksheets,
templates, fixtures), test run, trace read, screening tools. Feed data and evaluator
output reach it as fenced data, never as tools. Injection is bounded, not eliminated
(TS-1); taint fires on reading M3 feed data or a multi-writer shared sheet.

### 8.2 The write model and its legibility (spec RB-9)

Two write classes, marked **at compose time** in the assistant UI:

- **Live Class-A edits** (formulas, tests, templates): un-gated; the human sees the result
  render immediately. A persistent affordance marks drafted actions as "applies live."
- **Publishing to a shared space, source/component edits, feed-config edits:** routed
  through the attended full-diff gate (TS-19b), marked "will require your approval" before
  the agent accumulates twenty silent live edits.

### 8.3 The authoring loop (infer-then-fortify, operationalized)

The assistant's standing harness (not prompt folklore) implements: infer on a subset with
holdout withheld → emit formula + holdout `specification` tests → propose metamorphic
relations from the stdlib vocabulary → capture fixtures via the freeze flow (tier shown) →
optionally invoke the independent second agent for intent-derived tests → present
formula + tests + result + kind-coverage in one review surface.

The draft **standing system prompt** for the formula-authoring agent is
[assistant/FORMULA_AUTHORING_PROMPT.md](assistant/FORMULA_AUTHORING_PROMPT.md) — it encodes
the syntax contract (§3.1), the authoring loop, the test-kind rules, fenced-data handling,
and the live/gated write boundary, with a design-rationale section mapping each part to its
finding. Load-bearing behaviors (holdout, kind-weighted review) are stated there as facts
about the environment and *enforced by the harness*, not left to prompt discipline. The
prompt is part of the surface E-6 (the RQ-A5 agent-loop gate) evaluates.

### 8.4 Report generation (PD-3), sequenced honestly inside v1

Plan-then-generate, per report RQ-F2/F3:

1. **Message-finding:** the assistant calls the computed screening tools (`trend`,
   `outliers`, `deltas` — §3.2) and produces a structured **brief** (audience, key
   question, 1–3 findings, supporting breakdowns). Optional author confirmation of the
   brief for high-stakes reports.
2. **Layout:** a generation pass expresses the brief in the catalog. Restraint is enforced
   by catalog ceilings first, then **mechanical lints** (max accent colors per view, max
   tiles per viewport, palette membership, slice/axis caps — deterministic, vega-lint
   style); a critique pass checks only against the mechanical rules and the brief (external
   anchors), never vibes (the self-critique evidence, RQ-F3).
3. **Iteration:** targeted edits via search/replace or unified diff against the
   deterministic MDX structure, whole-file regeneration as fallback; target ≥90%
   small-reviewable-diff success on the 20-request benchmark (RQ-F6).

**Gate (non-negotiable, report RQ-F4):** the F4 harness — anchored rubric (message
clarity, hierarchy, chart-form appropriateness, restraint, responsive integrity, theme
integrity, accessibility), benchmark set, judge panels calibrated per-dimension against
human raters with **chance-corrected κ** (pairwise, AB/BA order-swapped,
length-neutrality in rubric, no same-family self-judging) — is built in **M0** and no
generation-quality claim ships ahead of its per-dimension agreement numbers. Generation
can ship in v1 (PD-3) because the harness comes first *within* v1.

---

## 9. The platform workstream — seven deltas (PD-5, PD-6)

The safety of everything shared or live rests on these. Each row is a booked workstream
this program owns, with the spec's gate test as exit criterion. Nothing shared/live ships
while its gating rows are open.

| # | Delta | Repo(s) | Design status | Exit gate test | Gates |
|---|---|---|---|---|---|
| D1 | Ingestion taint / output tiering + per-instance `capDir` delegation (spec §4) | site-main (+ SDK fs surface) | designed (TRUST_MODES §5 ext.), unbuilt | ingestion-taint gate: M3-bound output arrives tagged M3; two instances of one connector `appKey` share no source grant | all live/shared |
| D2 | **Host-enforced connector egress-fixing (spec Q3)** | site-main (host proxy) | **UNDESIGNED — first platform work item (M0 design sprint)** | egress-fixing gate: hostile-connector harness cannot fetch a non-fixed host (incl. redirect/rebinding attacks) | all live |
| D3 | Non-executable-MDX safe renderer | immediately-run-sdk | designed + empirically verified (TRUST_MODES §5.1), unbuilt | `f={fetch("/x")}` captured as inert string; no evaluator in the pipeline | all rendering (M1) |
| D4 | Freeze/write-laundering enforcement (RS-10; rides R3-156 track) | site-main | designed direction, unbuilt | write-laundering gate: silent persist refused; explicit freeze refloors or is refused | freeze UX (M2), shared (M3) |
| D5 | Hardened sandbox profile (per-frame CSP delta on G1a) | sandbox, site-main | needs per-frame-CSP infra | connector frame: `connect-src 'none'` with `net:fetch` surviving via host proxy | live (M3) |
| D6 | Composite: manifest resolution, composite-aware powerbox (un-bundled TS-5b line, mobile one-member-per-card), inspector + aggregate reach view | site-main | net-new (spec §6) | powerbox tests (badge integrity, un-bundled elevated line); run-mode-first gate (static doc → zero powerbox, desktop + mobile) | shared/live (M3) |
| D7 | **AA-01 program-identity `appKey`** (per-entry-point identity) | site-main | V2 design of record exists (AGENT_AUTHORING §5.1); unbuilt | sibling-isolation gate: two entry points of one repo hold disjoint grant bundles; engine entry point resolves to an empty bundle | realm isolation being real — anything shared (M2→M3 boundary) |

Design content for D2 is already fixed by the report (RQ-E1) — the sprint's job is the
host-side design doc + adversarial pass, not research: allowlist of scheme+host+port;
resolve-then-pin the IP; re-validate the resolved IP after **every** redirect hop (or
disable redirects); block RFC1918/loopback/link-local/CGNAT/ULA/metadata ranges;
single egress proxy (Smokescreen as reference); per-instance fetch budgets (rate + volume)
as the anomaly tripwire; CSP `connect-src` as defense-in-depth; wildcard subdomains
avoided. **Named residual, stated everywhere the feature is described:** request-body
exfiltration to a legitimately allowlisted host — handled by budgets + tiering, not
closable by egress rules.

Tier granularity (RQ-E2): **one tier per feed-instance** at launch; over-tainting is
instrumented from day one ("reports where ≥1 element is up-tiered solely due to a single
non-flowing low-trust input"), and per-column tiering is built only if that measurement
exceeds ~20% of shareable reports (report threshold).

Findings that change spec premises go back to the canonical
`docs/specs/REPORTING_SPREADSHEET_SPEC.md` (and siblings), not just this repo's copy. The
spec's requested third fresh-agent adversarial pass should run against the D2 design
sprint output together with the spec revision.

---

## 10. Milestones

Dependencies, not dates. Each milestone has named exit gates; a gate is a test or a
measured number, not a vibe. The maximalist scope (PD-1..3) is absorbed by strict internal
sequencing: the static path is up first, live/shared last, exactly as the platform spec's
run-mode-first value ordering implies.

### M0 — Design sprints, harnesses, spikes (parallel; nothing ships)

- **D2 egress-fixing design sprint** (the undesigned load-bearing gap) → design doc +
  adversarial pass with the metacircular-connector attack walked through.
- **F4 judge harness** built and calibrated: rubric, benchmark set, per-dimension κ vs.
  human raters. Exit: κ published per dimension; dimensions below agreement threshold are
  marked judge-unusable (human review required there).
- **B1 scheduler spike:** suspending-vs-restarting benchmark over synthetic graph families
  (deep chains, wide fan-out, diamonds, 10³–10⁵ cells); early-cutoff hit rate on typical
  edits. Exit: engine design note with measured numbers.
- **A1 bake-off (validation, PD-4):** ~50 shaping tasks, three surfaces, driven from
  self-descriptions alone; measures first-attempt correctness, hallucinated-API rate, diff
  size on follow-up edit. Exit: numbers vs. the promotion rule.
- **C1 transport rig:** the write-notify-read loop measured end-to-end (p95), rate × size
  × transport swept. Exit: the v1 envelope numbers.
- **AA-01 (D7) implementation start** in site-main (design of record exists).

### M1 — The static core (first shippable: static dashboards, shareable, zero-consent)

- Engine: SES compartment, worksheet loading, explicit-input injection, suspending
  scheduler with (value-hash, tier) cutoff, cycles-as-error, watchdog.
- Document model v1 (§3) frozen at format-version 1; stdlib core + self-descriptions.
- Report view + catalog on the **SDK safe renderer (D3 — must land here)**; responsive +
  themed + degraded states; params/drill-down.
- Diagnostics channel + source-mapped errors (host-side maps).
- **Exit gates:** run-mode-first gate (static doc → zero prompts, desktop + mobile);
  safe-renderer gate (inert-string test); recalc budget (p95 < 100 ms @ 10⁴ cells) +
  glitch-freedom property test; catalog expresses ≥90% of the good-exemplar corpus (RQ-F1).

### M2 — The authoring product (assistant, tests, generation)

- Tests-as-cells with kind labels; review surface with validated/pinned/untested states;
  holdout affordance; metamorphic/PBT stdlib; trace replay.
- Freeze + fixture-capture UX with visible tier consequence (pulled forward per §5.4;
  host enforcement D4 lands here for the local case).
- Assistant realm: G12 catalog, live/gate legibility, infer-then-fortify harness,
  second-agent test authoring.
- Generation pipeline (brief → layout → mechanical lints → anchored critique), quality
  claims gated on M0's κ numbers; F6 edit-loop benchmark ≥90%.
- **AA-01 (D7) lands** — realm isolation becomes real. Everything before this in M2 is
  dev-mode only with respect to isolation claims.
- **Exit gates:** RQ-A5 agent-loop gate (an agent completes create→declare→test→run→read
  failure→fix cold from the published catalog, zero out-of-catalog guesses); D7
  sibling-isolation gate; freeze-UX usability pass (users predict the tier consequence);
  F4-scored generation baseline published.

### M3 — The live, shared product

- Connector realm + feeds config; materialize-to-OPFS + notification; retention,
  conflation, freshness bound per the M0 envelope.
- Platform: **D2 egress proxy built** (gate test passing), D1 output tiering +
  per-instance delegation, D5 hardened profile, D6 composite powerbox + inspector +
  aggregate reach view (mobile-complete: one-member-per-card, connector as its own
  full-screen step).
- Tier-on-the-graph live end to end; over-tainting instrumentation on.
- **Exit gates:** all seven D-rows' gate tests green; the spec's must-establish table
  (spec §13) green in CI; C1 envelope published in docs; mobile real-device pass for
  consent + drill-down (emulators insufficient, platform practice).

### M4 — Hardening, measurement, and the trust claim

- Mutation-score CI signal; the D5 four-arm injected-bug study (characterization-only /
  +holdout / +metamorphic / full loop) with plausible mis-inferences in the corpus —
  target ≥80% catch on the full loop; if holdout+metamorphic catches <60%, the
  publish-to-shared path gains a mandatory second-agent specification-test gate (report
  threshold).
- E3 consent A/B (delta-only vs. new-total, grant/deny + comprehension), E2 over-taint
  verdict written, E4 real-device consent validation.
- Viewer trust claim (§7) shipped in chrome — last, once true.
- Third fresh-agent adversarial pass on the spec + this plan's implementation deltas.

### Sequencing rationale in one line each

- F4 before any generation claim: the report's non-negotiable (uncalibrated rulers).
- D2 design in M0 even though the proxy ships in M3: undesigned + load-bearing means its
  design risk must be retired first, not discovered late.
- Freeze/fixtures in M2 not M3: infer-then-fortify makes capture mainline (report D4).
- AA-01 inside M2: the last point where "realms share an appKey" is honest, because M3 is
  where strangers' documents and real credentials arrive.

---

## 11. Experiments and thresholds (booked, with owners in the milestone plan)

| ID | Experiment | Decides / validates | Threshold that changes a call |
|---|---|---|---|
| E-1 | A1 surface bake-off (M0) | PD-4 validation | SQL-hybrid ≥10 pts better first-attempt AND comparable diff auditability → promote to co-equal surface |
| E-2 | B1 graph benchmark + glitch property test (M0/M1) | scheduler choice details; budget | p95 ≥ 100 ms @ 10⁴ cells → revisit (subgraph partitioning first, never SAB) |
| E-3 | Early-cutoff hit-rate on realistic edits (M1) | whether hashing pays | hit rate ~0 on real workbooks → keep hashing only at snapshot boundaries |
| E-4 | C1 transport sweep (M0) | v1 live envelope | loop exceeds freshness budget at ≤30 Hz mid-size → tiered message bus moves into M3 |
| E-5 | F4 per-dimension κ (M0) | which dimensions judges may score | κ below threshold on a dimension → human review required for that dimension |
| E-6 | RQ-A5 agent-loop gate (M2) | catalog self-description quality | any out-of-catalog guess → description iteration before ship (descriptions rot; budget for it) |
| E-7 | D5 four-arm injected-bug study (M4) | test-loop teeth | full loop <80% or holdout+metamorphic <60% → mandatory second-agent gate on publish |
| E-8 | E2 over-taint instrumentation (M3→M4) | tier granularity | >~20% shareable reports over-tainted by one non-flowing input → build per-column tiers |
| E-9 | E3 consent A/B + comprehension (M4) | aggregate-reach presentation | new-total consent fails to improve detection → redesign before relying on it |
| E-10 | F6 edit-instruction benchmark (M2) | iteration loop format | <90% targeted-diff success → tighten template determinism / fall back whole-file more aggressively |

---

## 12. Risks and open questions

**Carried from the platform spec (not re-opened here):** Q1 composite spec spin-out; Q2
sufficiency of the egress-fixing + tiering backstop pair against a metacircular-connector
fork; Q4 the connector's elevated slot (open vs. first-party-restricted); Q5 high-frequency
bus; Q6 freeze-refloor UX surprise; Q7 owners for mobile surfaces. Q3 is now the M0 design
sprint (D2).

**Plan-specific risks:**

- **R-1 (schedule, from PD-1):** seven platform deltas gate M3; one undesigned. The
  dependency itself is intentional — Reckoner is the forcing function for these platform
  capabilities (§1), so "blocked on platform work" is the program working as designed, not
  a planning failure. The residual risk is purely schedule-shaped, and the fallback is
  explicit: if D2's design sprint uncovers a blocker, ship M1/M2 (static + authoring) as
  the public product and hold live behind the gate — the milestone structure makes this a
  scope cut, not a redesign.
- **R-2 (isolation honesty, from PD-6):** between M1 and AA-01 landing, the four "realms"
  share an appKey. Nothing shared ships in that window; dev/demo materials must not claim
  isolation before D7's gate is green.
- **R-3 (generation quality, from PD-3):** if M0's κ shows judges unusable on core
  dimensions, generation still ships but its quality bar rests on human evaluation
  throughput — slower iteration, same gate.
- **R-4 (scale ceiling):** pure-client-side calc has a documented ceiling. Connectors
  pre-aggregate; a size budget per pulled frame is enforced with a visible flag, not a
  silent truncation.
- **R-5 (additive-only stdlib):** a mis-designed stdlib function can never be removed.
  The v1 surface stays deliberately small (§3.2); every addition needs the anti-affordance
  review + self-description eval.

**Parked (from the research proposal's known-unknowns, unchanged):** concurrent multi-author
editing semantics; workbook versioning / "which numbers did we report last quarter"
reproducibility; spreadsheet import (formula translation explicitly not promised);
catalog/stdlib versioning across long-lived shared documents; BYOK quota/cost behavior.

---

## 13. Decisions & rejected alternatives

- **Full-live v1 with strict internal milestone gates (PD-1)** over static-first shipping.
  *Rejected:* static-only v1 (deferred value); shipping live before the D-row gate tests
  pass (safety theater).
- **Assistant and generation in v1, F4-harness-first inside v1 (PD-2/PD-3).** *Rejected:*
  substrate-only v1; making generation-quality claims before per-dimension κ exists
  (uncalibrated ruler — report RQ-F4).
- **Minimal JS core + shaping stdlib; fluent table as sugar; SQL rejected as primary
  (PD-4, report RQ-A1).** *Rejected:* SQL-hybrid primary surface (opaque to additive-only
  contract and test-beside-formula review); dataframe as a separate engine.
- **One repo, realms as entry points, AA-01 in-program (PD-6).** *Rejected:* four sibling
  repos (real isolation today but 4-repo coordination cost — user decision); one repo
  *without* AA-01 (permanent isolation fiction).
- **Platform deltas in-program (PD-5).** *Rejected:* treating them as external
  dependencies (live path with no committed delivery).
- **Explicit dependency declaration; injection makes undeclared reads unnameable
  (report RQ-A2).** *Rejected:* traced/recorded dependencies as the foundation (reachable
  set becomes a runtime property at a security boundary); volatile `INDIRECT()`-style
  dynamic reads.
- **Suspending scheduler + verifying hash traces + early cutoff over (value, tier)
  pairs (report RQ-B1/B4).** *Rejected:* dirty-bit + topo sweep (no early cutoff);
  cutoff on value alone (tier laundering).
- **Cycles are always an error with full path (report RQ-B2).** *Rejected:* iterative
  calc in v1.
- **Single-context evaluator; transfer/OPFS if parallelism ever comes; never
  SharedArrayBuffer on the critical path (report RQ-B3).**
- **Feeds as frozen snapshots + explicit `window()`; connector owns raw retention;
  conflate inputs, recompute immediately, rAF-align rendering (report RQ-A3/C2/C3).**
  *Rejected:* query-handles to the connector (makes the pipe agentic);
  debounce-the-recompute.
- **Tests-as-cells with mandatory kind labels; holdout + metamorphic + mutation as the
  anti-circularity core; fixture capture = freeze, mainline, tier-preserving (report
  workstream D).** *Rejected:* separate test-runner realm; treating green suites as
  correctness; synthetic fixtures generated by the formula under test; DP on fixtures
  (overkill for v1, re-affirmed).
- **Egress-fixing per the OWASP/Smokescreen recipe with the body-exfil residual named
  (report RQ-E1); per-feed-instance tiers first, measured before finer granularity
  (RQ-E2).** *Rejected:* blocklists; wildcard grants; per-column tiers on day one.
- **~10-form catalog with anti-affordances excluded by construction; one responsive
  template, catalog-owned adaptation; plan-then-generate with computed message-finding;
  mechanical lints + externally-anchored critique (report workstream F).** *Rejected:*
  raw grammar-of-graphics exposure; per-form-factor variants as the norm; vibes-based
  self-critique.
- **Viewer trust claim: report candidate #1, shipped last.** *Rejected:* over-claiming
  "safe" (Gatekeeper pattern); shipping the sentence before it is true.
