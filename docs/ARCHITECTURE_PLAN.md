# Reckoner — Architecture Plan

**Status:** plan / draft — scope decisions made 2026-07-09 (recorded in §1); design mechanisms adopted from `reckoner_research_report_v2.md`; **adversarial-review-1 findings incorporated** (`ADVERSARIAL_REVIEW_1.md`); nothing here is built · **Updated:** 2026-07-09

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

## 0. Provenance map — what carries research weight, what is spec-derived, what is a decision

So a reader can tell at a glance which claims are *research-backed*, which are *inherited
from the platform spec*, and which are *product/engineering decisions* made here (and
therefore re-openable by decision, not by re-reading the report). Verdict from the
rootedness audit (2026-07-09): the plan is **near-1:1 faithful to the research report at the
recommendation and threshold level** — so faithful that two recalc BLOCKERs found in
adversarial-review-1 were *inherited* from the report's own unexamined corners, not
introduced by drifting from it. Its independent content is spec- and decision-rooted.

| Area | Primary root | Fidelity / note |
|---|---|---|
| Formula surface, dependency model, purity (§3.1–3.2) | **Report RQ-A1/A2/A4/A5** | Principle faithful. The *enumerated stdlib* is the plan's extrapolation beyond the report's five-family sketch — and exactly where the DSL review drew blood (the sketch never reached ordered/relational ops). Review-1 additions close it. |
| Recalculation engine (§4) | **Report RQ-B1/B2/B3/B4** | Verbatim adoption. The "no debounce" cadence (RQ-C3) + watchdog (RQ-A4) were adopted *too* faithfully — the report never worked out the eval-time>interval progress case, so the plan inherited the F2/F6 livelocks. Now fixed with stated invariants (§4.1/§4.2). |
| Streaming / data plane (§5) | **Report RQ-C1/C2/C3/C4** | Faithful; the F3 atomic-frame and F8 param-conflation invariants are the plan's own engineering the report left implicit. |
| Testing architecture (§6) | **Report RQ-D1–D5** | Faithful, including the D4 "fixture-capture-is-mainline" revision (which is *why* freeze moves to M2). H3's holdout-enforcement gap is the plan's own (the report assumed enforcement; the plan's `rw@self` grant defeats it → D9). |
| Generation pipeline (§8.4) | **Report RQ-F1–F6** | Faithful; F4-harness-first preserved as the report's non-negotiable. |
| Egress-fixing, tiering, reach view, trust claim (§7, §9 D2/E-rows) | **Report RQ-E1–E5** | The only security content the report supplies. Recipe faithful; the *host-enforced design* (D2) and the trust-claim wording (H1) are the plan's/​review's, not the report's. |
| **Four-realm decomposition, safe renderer, composite manifest (§2, §3.3)** | **Platform spec** (REPORTING_SPREADSHEET_SPEC §2/§3, TRUST_MODES §5.1) | Not from the report — the report has no architecture. |
| **Platform workstream, repo topology, AA-01, the nine deltas, milestones (§9, §10)** | **Platform spec + product decisions** | Not from the report. Rooted in the spec's §8 dependency ladder and PD-5/PD-6. |
| **The six product decisions (PD-1…6, §1)** | **The 2026-07-09 planning session** | *Not* from the report — and PD-1 (full-live v1) and PD-3 (generation in v1) are **bolder than the report's cautious staging**, which files those as Phase 2/3 and "the softest evidence." Reconciled by keeping the report's *internal sequencing* (F4-first, D2-first, E3-gates-M3) while overriding its *scope* caution on the user's authority. |
| Concrete syntax, file formats, worked examples (§3) | **The plan's own construction** | Consistent with the report's principles; the report showed no code. |
| Adversarial-review-1 invariants + the two added platform deltas (D8/D9) | **This program's review** | Neither report nor spec; found by the 2026-07-09 fresh-agent passes. |

**The one honest tension:** the plan is more report-faithful than it is report-*cautious*.
Where it steps past the research it does so on scope (PD-1/PD-3), not on mechanism — and it
pays for that by carrying the report's own blind spots (stdlib completeness, recalc
liveness) until the adversarial review surfaced them. Full audit reasoning is in the session
record; findings that resolved it are in `ADVERSARIAL_REVIEW_1.md`.

---

## 0.1 Design order — what to specify up-front vs. at implementation time

Reckoner is the most ambitious immediately.run app so far and deliberately pushes the
platform's boundary, so some corners are unavoidably under-specified. The discriminator for
**up-front** design is: *a cross-realm data contract, a hard-to-reverse format/protocol, or the
thing the confidentiality property rests on — where guessing wrong forces rework beyond one
realm.* Everything else is deferrable. Tellingly, **both adversarial-review-2 BLOCKERs and the
recalc glitch were failures of the first spine below** — not a wrong fragment, but fragments
that didn't compose. The gaps that hurt are all at the **seams**, not within a realm.

**Three spines to design up-front (in this order):**

1. **Engine information-flow — the epoch × tier × egress-channel contract.** *Spec:*
   `docs/specs/ENGINE_INFORMATION_FLOW_SPEC.md` (drafted). The unifying contract the per-channel
   specs lacked: every value leaving the engine (result, diagnostic, trace, frozen fixture, test
   verdict) is a controlled channel carrying `(epoch, tier)` and declaring `(audience,
   bandwidth)`. Owns the fixes the review found by *composition*: the D9 test-oracle
   (trace/verdict channels) and the recalc mixed-epoch glitch (the result channel to a
   subscriber). **Reckoner-internal, so we own it end to end — do it first.**
2. **Composite capability & lifecycle topology.** *Not yet drafted; likely a platform spec.*
   The realm × capability × minting-authority matrix + the launch / keep-warm / teardown state
   machine, resolving how D1 (per-instance delegation), D7 (AA-01 appKeys), D8 (launch-to-run),
   and D9 (redacted mount) **compose**. This *is* the isolation property; every realm's
   "can't reach X" claim depends on it, and it rides the design-pending D8. Platform work — needs
   the roadmap conversation.
3. **Document durability & evolution — the version envelope.** *Fold into the M1 format freeze.*
   Only the envelope + compatibility policy (how a document declares the format/stdlib/catalog
   version it needs; how an old document is resolved; what "additive-only" must guarantee) — not
   the migration machinery. Cheap now, a per-document migration later. Subsumes the parked
   reproducibility question ("which numbers did we report last quarter" falls out if the envelope
   records provenance) and must decide the **constraint** that the format does not preclude a
   later concurrent-multi-author merge (a one-line constraint, not a v1 design).

**Safe to defer to implementation time** (realm-local, additive-safe, or a well-understood
pattern behind a clear interface): exact stdlib signatures (bake-off validates; additive-only —
*given* spine 3's envelope); component visual design (briefs; additive catalog); diagnostics
record format + source-map plumbing; per-API pagination extraction rules (per-feed trusted
config); mobile chrome specifics (D6); chart drill gestures + freeze UX; BYOK cost/quota.

**Decide the constraint now, design later:** concurrent multi-author editing (constrain spine 3's
format to not preclude it); reproducibility (a corollary of spine 3's versioning + the freeze
model).

The within-realm design (formula language §3, recalc algorithm §4, catalog §3.3, testing loop §6)
is specified enough to build. The seams are the up-front work.

---

## 0.2 Dogfooding — developing Reckoner within immediately.run  *(planning stance — strong preference, not a hard requirement)*

Reckoner is a forcing function on **two** axes, not one. Axis 1 (the rest of this plan) is the
platform's **runtime** capabilities — the nine deltas. Axis 2, stated here, is the platform's
ability to **host its own development**: the strong preference is that Reckoner be built *inside*
immediately.run (edit → test → preview → commit, in-platform), so the app doubles as the proof
that the platform can develop non-trivial apps in itself. Where the platform can't yet host a
step, that gap is a **self-hosting forcing-function requirement**, tracked like a delta — not a
reason to give up the preference.

**The dogfooding gradient is layered, and it deepens across the milestones** — stated honestly,
because a four-realm SES composite cannot be *fully* built in-platform until the composite
capabilities it forces (D1–D9) exist (a real recursion). Three layers:

- **In-platform today** (the shipped editor working-tree + CoW overlay, the agent write-port
  AA-23, VCS control, and the `local`-provider host preview — `LOCAL_DEVELOPMENT_SPEC`,
  `EDITOR_AS_APP_SPEC`, `AGENT_AUTHORING_ARCHITECTURE`):
  1. **Authoring all document *content*** — worksheets (`*.sheet.js`), templates (`*.mdx`),
     fixtures, feeds config, `reckoner.json`. This is the *most* dogfoodable work: it is plain
     files the platform editor + agent already edit, rendered live in the host preview. The
     Meridian case-study workbook (brief 01) is entirely in-platform content work.
  2. **Iterating app *source*** (engine, report view, catalog) via the editor + agent write-port
     + live host reload.
  3. **The design/spec/doc work itself** (markdown in the editor) — this session's artifacts
     included.
- **In-platform *by construction* once the engine lands (M1)** — a Reckoner win, not a platform
  ask: because **tests-as-cells run in the browser engine** (§6), a full-workbook test run is a
  *browser* operation, so running a document's test suite needs no Node test runner. Dogfooding
  gets *easier* precisely where a normal app would need CI.
- **Gated on platform self-hosting capability** (the honest gaps → tracked requirements):
  Node-side CI gates for the *TypeScript source* (`npm run build`/`lint`/`vitest`, mutation
  testing) are not browser operations; dependency resolution (SES, CodeMirror) rides the
  platform's module-fetch path but is unproven for these packages; and running the *real
  multi-realm composite* in-platform is gated on D1–D9 (the recursion). Full self-hosting of the
  platform *deltas themselves* (site-main/sandbox work) is the north star, out of scope as a v1
  requirement.

**Self-hosting requirements this program books** (distinct from the runtime deltas D1–D9;
Reckoner is the forcing consumer for each):

| # | Self-hosting capability | State | Needed for |
|---|---|---|---|
| S1 | In-platform edit → live-preview loop for app source | **exists** (editor + agent + `local` provider) | authoring content & source (all milestones) |
| S2 | In-platform document-test execution | **by construction** (tests-as-cells run in the engine) | running Reckoner's own suites (M1+) |
| S3 | In-platform VCS (branch/commit/push) | **partial** (editor `vcsControl` / working-tree) | committing without leaving the platform |
| S4 | In-platform Node-equivalent CI gate (build/lint/source-tests/mutation) | **gap** | the source-level gates CLAUDE.md requires |
| S5 | In-platform dependency resolution for SES/editor deps | **gap/unproven** | building the engine & editor realms in-platform |
| S6 | Running a multi-realm composite in-platform | **gated on D1–D9** (recursion) | dogfooding the *real* app, not a stub |

**Planning consequence — mark work items in-platform-completable.** From M0 on, each work item
carries an **in-platform tag**: ✅ *fully in-platform now* (content authoring, spec/doc work),
◐ *in-platform once its milestone's engine/deltas land* (document tests M1; live composite
M3), or ✗ *needs S4/S5 (external CI/deps until self-hosting closes the gap)*. The default is
in-platform wherever a layer above supports it; an ✗ item is a booked self-hosting requirement,
not an accepted permanent exception. §10 milestones apply these tags.

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
is the Reckoner app; Track 2 is **nine platform deltas** (six from spec §8, plus AA-01, plus
the launch-to-run/standing-app-lifecycle capability the per-instance delegation rides, plus
the redacted-mount-view holdout mechanism — §9). Q3 egress-fixing was the most load-bearing
gap; its **design sprint ran first and is now done**
(`docs/specs/CONNECTOR_EGRESS_FIXING_SPEC.md`, §10 M0), which found the SSRF proxy already
built and only the connector target-fixing layer undesigned — now designed. **D9's design
sprint also ran** (`docs/specs/HOLDOUT_REDACTED_MOUNT_SPEC.md`): the holdout mechanism is
path-level (held-out rows at an ungranted `.holdout/` scope, reusing the existing
`scopedFs`/`attenuateDelta` machinery — no new fs primitive). **Both formerly-undesigned
deltas are now designed;** all nine have a design of record, and the remaining work is build,
not design.

> *(Adversarial-review-1 reconciliation, 2026-07-09 — the prior text said "seven deltas."
> The security pass (H4) showed the per-instance `capDir` delegation folded into D1 in fact
> **rides an unbuilt, design-pending launch-to-run/standing-app-lifecycle delta** (spec §4.3,
> §6.3, §8), and the holdout mechanism (H3) needs its own host delta; both are now booked in
> §9 as D8/D9. The honest count is nine. See `ADVERSARIAL_REVIEW_1.md`.)*

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
enough to hold (**at the ~20 top-level-callable ceiling**, report RQ-A5), additive-only
forever:

- **Shaping (reductive):** `table()` (the fluent sugar), `groupBy`, `rollup`/`aggregate`
  (with `sum`, `mean`, `median`, `count`, `min`, `max`, `quantile`), `join` (inner / left /
  **`how:"full"`** + **`antiJoin`**, with documented **composite `on`**), `pivot`, `window`
  (event-time, for feed history), `sort`, `topN` (with "other" bucket), `derive`, `filter`.
- **Shaping (ordered / relational-across-rows) — added by adversarial-review-1 (DSL-1/2/3):**
  `lag`/`lead` (prior/next row within a sorted partition), `scan`/`cumulative` (running
  fold: `cumsum`, `cummax`, running-mean, EMA), `asofJoin` (nearest-preceding key match —
  the FX carry-forward). These are the SQL window-function + as-of set; without them the
  case study's defining logic (month-over-month movement, running retention, gapped-FX
  normalization) collapses to the hand-rolled reduce loops the design exists to prevent.
- **Dates (pure) — added by review-1 (DSL-5):** `monthsBetween`, `monthKey`/`truncate`,
  `addMonths`/`addDays`, `fiscalPeriod`, `resolveRange("last-90d", now)`. Explicit,
  timezone-safe, no ambient clock (the clock stays a declared `params.now` input).
- **Null / empty semantics (specified, not left implicit) — review-1 (DSL-6):** `rollup`
  over an **empty group returns `null`, not `0`** (0 is a wrong answer for `mean`/`median`);
  a left/`asof` join miss yields `null`, not an absent row; arithmetic in `derive`
  propagates `null` (never `NaN`/`Infinity` silently). `coalesce`/`orElse` and `safeDiv`
  (÷0 → `null`) are stdlib citizens. This is a correctness gate, not a convenience: an
  undefined empty-group return lets a fitting fixture with no empty group pass green while a
  `NaN` bug hides (the RQ-D5 mis-inference class).
- **Testing:** `testCell()`, `expectEqual`/`expectClose`, `property()` (PBT),
  `conservation()`, `permutationInvariance()`, `scaleInvariance()` — metamorphic relations
  as named stdlib citizens (report RQ-D5): they are the non-circular correctness evidence
  in a workflow where nobody knows the "true" formula.
- **Screening (assistant-facing, §8.3):** `trend()`, `outliers()`, `deltas()` — the
  computed message-finding tools, themselves pure formulas.

> *(Adversarial-review-1, 2026-07-09 — the prior surface was "well under 20 callables" with
> only the reductive shaping set. The DSL pass showed it covered the reductive half of the
> case study cleanly but had **no primitive for the ordered/relational-across-rows half**,
> so exactly that logic fell to hand-rolled reduce loops. The window/as-of/date/null
> additions above (user decision: add now, ahead of the M0 bake-off, since the additive-only
> freeze makes a missing family permanent) are the standard, boring SQL-window set — still
> at/under the RQ-A5 ceiling because they replace loops, not add surface area. See
> `ADVERSARIAL_REVIEW_1.md` DSL-1..8.)*

Every callable ships a JSON-Schema-typed self-description with purpose line, per-parameter
descriptions, enums for closed choices, and 1–2 worked examples (RQ-A5); the catalog of
self-descriptions is a first-class evaluated artifact with its own gate test (§11). The
fluent `table()` API is a thin layer over the plain-value core — `table(rows)…rows()` in,
plain rows out; same semantics, no second engine, no separate columnar runtime. Two naming
notes from review-1: `window` (event-time feed buffering) is distinct from the window
*functions* `lag`/`scan` — the self-descriptions must disambiguate (DSL-8); and a cohort-%
that pivots before normalizing forces an `Object.keys` loop, so the `pivot` self-description
steers **normalize-before-pivot** (DSL-4).

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

Rendering a stranger's *template* is therefore safe **by grammar** — the template
contributes no executable code. (This is a claim about the template layer only. Opening the
whole dashboard also *runs the author's worksheet formulas* in the engine; that is safe by
SES starvation + the tier backstops — the app-structural discipline the spec (§3.2) marks
unbuilt and fork-weakenable, and which is fiction until D7 per PD-6. Do not launder
template-grammar safety into whole-dashboard safety — see §7's trust claim, corrected by
review-1 H1.)

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
3. Values arrive **with their tier**. The tier/trust **badge is host-rendered chrome, not
   Reckoner's** (review-1 H2): a trust signal drawn by app code is forgeable by a malicious
   fork (receive `tier=M3`, render an M1 badge). Reckoner reserves the layout slot and
   supplies the value; the host draws the badge, exactly as it draws the aggregate reach
   badge (§7). A template never touches values (only names them), so it cannot launder — but
   the *signal that conveys tier* must be host-owned or it carries no weight on a fork.
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
- **Async formulas:** allowed (a formula may return a promise for chunked computation).
  Cancellation is **bounded, not unconditional** (review-1 F2 — the load-bearing progress
  invariant): an in-flight evaluation is **run to completion against its snapshot**, never
  cancelled by a newer input; at most one "newest pending snapshot" is queued per cell, and
  when the running eval lands, if a newer snapshot exists it re-evaluates exactly once
  (single-slot supersession). This is what makes progress hold when a formula's eval time
  `e` exceeds a feed's conflation interval `c` — unconditional cancel-and-restart (the naïve
  reading of Bazel restarting semantics) would perpetually cancel such a formula before it
  finished (a livelock). Purity makes each *would-be* result correct; the supersession rule
  is what makes one *land*. **Freshness bound: `critical-path-depth · max(c, e)`, not
  `max(c, e)`** (review-2 C-1 — the earlier draft's `max(c,e)` was the *single-cell* bound
  mis-stated as the workbook bound; a depth-`d` serial chain under a never-stopping feed lags
  `d·max(c,e)` and never closes while the feed runs — the irreducible cost of a serial
  pipeline with `e>c`, §5.3). Throughput is unaffected (supersession skips intermediate
  snapshots); the lever for deep-chain latency is reducing `d` (pre-aggregate in the
  connector, flatten the hot path).
- **Watchdog — split hard from soft** (review-2 C-2/C-3, replacing the earlier
  `(cell,input-hash)` sticky memo, which **failed under a live feed**: every tick is a fresh
  input-hash so the memo never hits, and a diverging cell would tear down the whole context
  every `e`, forever — a live relaunch livelock, plus unbounded memo growth). The budget
  bounds **async wall-clock** (review-1 L5). Two distinct failure classes, handled
  differently:
  - **Hard runaway** (synchronous, CPU-bound; the context had to be `terminate()`d): governed
    by a **per-cell circuit breaker** — after N terminations attributable to a cell within a
    window (*regardless of input-hash*), the cell is **quarantined**: the scheduler stops
    demanding it and resolves its dependents with the propagated lattice error, until an author
    re-arms it. This is what makes progress hold when the diverging input keeps changing — the
    property the input-keyed memo lacked. Any input-hash memo is an *optimization only*, LRU-bounded (bounded memory; re-derivation on eviction is safe, just costly).
  - **Soft budget-exceed** (timing-dependent — machine load, GC, co-scheduled cells; **not** a
    pure function of inputs): **confirm before sticking** (reuse the double-eval already run for
    purity — a timeout counts only if it reproduces), and even then decay with TTL/backoff, never
    permanent. A wall-clock outcome must never be memoized as a pure function of inputs (review-2
    C-3 — that permanently poisons a fixture-driven test cell after one load spike).
  **Error is a first-class lattice value**: a terminated/quarantined cell resolves every
  suspended dependent with a propagated error — a waiter is never left pending on a value that
  will never arrive. SES does not protect availability (report RQ-A4 residual); the circuit
  breaker + error-as-value are how the engine survives it.
- **Single evaluator context for v1** (RQ-B3), with the blast radius owned explicitly: a
  synchronous divergence terminates and rebuilds the *whole* context, and survivors are
  re-scheduled from host-side state (which is why memo/epoch state lives outside the worker —
  it ties to the versioned publication of §5.2). The scheduler is written so independent subgraphs
  *could* be partitioned to a worker pool later, with data movement as transferable
  ArrayBuffers / OPFS — **never** assuming SharedArrayBuffer (the `crossOriginIsolated`
  constraint in opaque-origin sandboxed iframes is architecturally fragile; report caveats).

### 4.2 Recalculation scheduler

The report's RQ-B1 recommendation, adopted whole: a **suspending scheduler with verifying
(content-hash) traces and early cutoff** — the Shake/Bazel point in *Build Systems à la
Carte*.

- Immutable snapshots give reference-equality fast paths; content hashing catches
  "recomputed but identical" for early cutoff.
- **The cutoff equality is over the pair `(value-hash, tier)`** — never value alone, or
  early cutoff becomes a tier-laundering hole (RQ-B4). Tier propagates as a second product
  of the same traversal: tier = floor (greatest lower bound) over input *tiers*, so an
  unchanged value with a changed tier still re-labels downstream. **`(value, tier)` is one
  atomic result record** published together (review-1 F4): a subscriber on the result
  channel never observes a value from one epoch with a tier from another — the pair rule
  governs *publication atomicity*, not only cutoff equality. Each result carries an
  **epoch/generation stamp**; a late-landing async result from a superseded epoch is
  dropped, not published (this is where §4.1's single-slot supersession meets the tier
  fold).
- **Demand-driven on both the edit path and the live path** (review-1 F5). A feed change or
  param write is a **dirty signal**, not a value-delivery path: it marks inputs dirty and
  the scheduler rebuilds each dependent **once, after its transitive inputs settle**, then
  publishes the settled `(value, tier)`. Components subscribe to the *settled* result, never
  to per-arm intermediate notifications.
- **Glitch-freedom via a common-epoch barrier** (review-2 C-R-B — the decisive fix). The
  earlier "settle = each input has *a* landed value" was per-input and let a cell assemble
  `B@epoch-1 + C@epoch-2` of a shared ancestor A when the arms have different eval times (B
  slow, C fast, feed re-fires while B grinds; B@e1 is not superseded from B's own view, so the
  epoch-drop rule misses it) — the classic glitch, relocated from within-pair to
  across-inputs. **Fix: a cell assembles its inputs only at the greatest ancestor epoch `k`
  for which *every* transitive input has a landed result, publishes `D@k`, and holds faster
  arms until the slow arm reaches `k`.** No cell ever observes mixed-epoch inputs.
  - **The load-bearing trade, stated as a decision (review-2 C-R-B):** per-cell `max(c,e)`
    freshness and glitch-freedom are **mutually exclusive** on an asymmetric diamond under a
    continuous feed — you either publish the fast arm early (glitch) or hold it (stale).
    **Reckoner chooses glitch-free** (§13): a cell's freshness therefore equals its *slowest
    transitive path* (`critical-path-depth · max(c,e)`, §4.1), and the report never shows a
    number computed from inconsistent inputs. Correctness over latency — the right default for
    numbers people act on. The barrier subsumes the edit-path diamond (A→B, A→C, B→D, C→D)
    that F5 already handled.
- **Cycles are always an error** with the full cycle path reported (SCC decomposition,
  HyperFormula-style diagnostics); no iterative/fixpoint calc in v1 (RQ-B2 — recorded as a
  known cost for converging financial models; additive opt-in later is compatible).
  Dynamic-dependency deadlock-freedom rests on one stated invariant (review-1 F1): **the
  runtime dependency set of any cell is a subset of its statically cycle-checked conservative
  set, and the scheduler never suspends on an edge outside that set.** SCC runs over the
  namespace-*expanded* conservative graph (`candidates: "revenue.*"` → all of `revenue.*`)
  before the scheduler ever demands a cell, so a runtime cycle formed through
  `candidates[which]` is always contained in a static cycle and errored first. This requires
  every declared namespace to be **statically enumerable** at graph-publish time (asserted),
  and it owns a false-positive cost — a `focus` selector plus a summary tile referencing it
  is a *static* cycle even when no runtime configuration is cyclic — surfaced as a clear
  cycle diagnostic (there is no `INDIRECT()` escape by design). **Two enumerability
  invariants the earlier draft omitted (review-2 C-4):** (a) **`params.*` are graph leaves** —
  widget/host-written only, never cell-produced; a `params.metric ← cellC` producer edge would
  be invisible to the static SCC and reopen the C→params→D→…→C deadlock (if cell→param binding
  is ever allowed, it must be a *statically declared* edge included in the SCC); (b) a
  namespace token in an `inputs` declaration must be a **compile-time literal**
  (`candidates: "revenue.*"`), never a runtime expression (`params.whichNs + ".*"`), so the
  set is enumerable at publish. Both are checked at graph-publish, fail-closed.
- Mid-session tier change, **scoped by source** (review-2 C-6 — the earlier blanket
  monotonicity contradicted the plan's own mid-session consent-elevation affordance, §3.3):
  - **Autonomous** tier changes are **monotone non-increasing per session** (research_proposal
    line 329). An autonomous drop fires flush-then-restart of the affected subgraph, bounded to
    **at most once per tier level** (lattice height ~2–3) — the termination guarantee; a
    re-raisable *autonomous* tier could oscillate like the F2 livelock. Softened by value cutoff
    (only the cheap tier fold re-runs), never below the pair rule.
  - **User-consent elevations are permitted mid-session** (a viewer clicks "needs feed access"
    → grants → the feed rises to elevated, §3.3). This is deliberate, human-rate, and cannot
    oscillate, so it does not threaten termination. It applies as a **surgical in-place
    flush-then-rebuild of the affected feed subgraph** (O(1) per session), not a whole-dashboard
    re-mount — the long-lived subscriptions, window buffers/gap-markers (§5.3), and param state
    survive. "Re-mount" means a scheduler subgraph re-mount, not a teardown.
- Budget (from the research proposal): p95 < 100 ms recompute for a single-cell edit on a
  10⁴-cell workbook; glitch-freedom (no cell ever observes mixed pre/post inputs) proven by
  a property test over random DAGs (§11 E-2). **Honesty note (review-1):** the recompute
  budget is stated in *cells*, but the case study's cost is *data-volume*-dominated (a 5k-row
  join across 36 months) — E-2 budgets both a single-cell edit (riding cutoff) and a cold
  full recompute of the join-heavy sheets.

### 4.3 Diagnostics and debugging across the starved boundary

- **Diagnostics channel (RQ-D2):** the engine's only other output is a host-owned, typed,
  fixed-size, rate-capped, sampled diagnostic record stream (errors with stacks, logs,
  timings). Records inherit the tier of their originating evaluation. Source-map resolution
  happens **host-side** — the compartment never fetches maps. Surfaced in authoring UI
  only, never in shared-view mode.
- **Trace replay (RQ-D3):** authoring mode can record an evaluation (declared inputs →
  stdlib-call intermediates → output) and replay it *outside* the sandbox — sound because
  formulas are pure. **A trace carries the tier of its originating evaluation and is
  confined and suppressed exactly as the diagnostics channel is** (review-1 M5): its
  intermediates can contain M3 feed data, so it must not be the one engine-egress path that
  escapes the caps the diagnostics channel imposes. Surfaced in authoring only, never in
  shared-view mode; a diagnostic/trace from a *cancelled* eval is marked `cancelled` so
  replay never reconstructs a phantom evaluation. This is the primary agent-facing debugging
  surface (agents consume structured traces better than steppers). Layered under it: rich
  structured errors are expected to cover ~90% of need.
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
**Publication is versioned and atomic** (review-1 F3): the connector writes each new frame
to a **new content-addressed/versioned path** — never an in-place overwrite of a frame that
may be open — and the change notification carries the **frame id**; the engine opens *that*
id. This is what makes "frozen snapshot per recalculation" true at the byte level across the
two realms (connector writer, engine reader are different workers sharing a mount): no torn
read of half-of-frame-N/half-of-N+1, and no exclusive-lock contention on a shared OPFS sync
handle. Conflation is the natural implementation — keep-latest = advance the published id.
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
  immediately on the coalesced frame, align *rendering* to rAF. The published freshness
  bound is **`critical-path-depth · max(conflation interval, eval time) + one paint`**
  (review-2 C-1 — the single-hop bound is `max(c,e)`, but a bound cell downstream of a depth-`d`
  chain, and the glitch-free common-epoch barrier (§4.2) which holds fast arms to the slow arm's
  epoch, together make the honest end-to-end bound depth-scaled; it does not close while the
  feed runs). No debounce-the-recompute — the progress guarantee lives in the run-to-completion
  supersession rule (§4.1), not a debounce knob.
- **Param writes share this conflation** (review-1 F8): a dragged `Range`/slider emits
  60–120 Hz writes into the *same single-context evaluator*, so `params.*` writes are
  coalesced keep-latest and recompute once per coalesced value, exactly like feeds —
  otherwise a fast drag floods the evaluator or (under naïve cancel-restart) livelocks like
  F2. Interaction is "data flow the graph already understands" (§3.3) *into the same
  evaluator*, so it needs the same backpressure.

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
  fixtures — that is a feature. **What makes a shared fixture safe is the D4 mount refloor
  at capture time, not the tier tag traveling in the file** (review-1 L1): §3's rule stands —
  the in-file tier tag is *advisory display metadata*, the host's mount tier is
  authoritative, and content may not self-declare an output tier (spec §4.2). An implementer
  must attribute the safety to the refloor, never trust the file tag.

Because infer-then-fortify makes capture mainline, the freeze UX ships in **M2** (with
authoring), not with the live plane in M3 — the one place this plan re-orders the platform
spec's implied sequence, on the report's explicit recommendation.

---

## 6. Testing architecture

The mainline workflow is **infer-then-fortify** (report workstream D preamble): the
assistant infers a formula from observed data, then fortifies it with tests. This workflow
is structurally circular unless the platform breaks the circle, so the following are core
architecture, not test-infra niceties.

> *(Adversarial-review-2 re-scoping, 2026-07-09 — the load-bearing correctness signal moved.
> The review showed **example-based holdout cannot carry the weight the earlier draft assigned
> it**: (a) the agent authors the tests that run over the holdout and reads their result —
> pass/fail, the failure diagnostic, and trace-replay of declared inputs are a *literal read*
> of the held-out rows (D9-1, the test-oracle channel); and (b) for the affine/aggregate/lookup
> formulas that are Reckoner's explicit target (§7.1), the training split *determines* the
> holdout outcome by ordinary fitting, so holdout adds ~0 bits even perfectly sealed (D9-2).
> Decision (user, 2026-07-09): **the metamorphic + property + mutation legs are the stated
> load-bearing correctness signal; holdout is re-scoped to a best-effort regression/tripwire,
> not a correctness proof.** D9 stays as the best-effort defense it can honestly be, no longer
> the linchpin. See `ADVERSARIAL_REVIEW_2.md` §B.)*

1. **Test-kind labels** (`characterization` / `specification` / `metamorphic` /
   `property`) are mandatory on every test cell (§3.1) and drive the review surface: a
   formula covered only by characterization tests derived from its own fitting data is
   **visibly unvalidated** — a distinct visual state between "untested" and "validated." An
   example-based `specification` test over holdout no longer promotes a cell to "validated" on
   its own (review-2 D9-1/D9-2); "validated" now requires a **non-example-based** leg
   (metamorphic/property, or a passing mutation score).
2. **The oracle-free legs are load-bearing** (review-2, re-scoped). **Metamorphic relations
   and PBT** (`conservation`, `permutationInvariance`, `scaleInvariance`, `property` — §3.2)
   are non-circular, oracle-free, need no hidden data, and are what an agent states well; a
   uniformly-wrong formula (e.g. a wrong FX rate) is *not* caught by these alone, which is why
   **mutation testing** (item 5) is the offline check that the suite has teeth. These carry the
   correctness weight the report originally hoped holdout would.
3. **Holdout — best-effort regression/tripwire, not a correctness proof** (review-2 D9-1/D9-2).
   The host still withholds a slice and emits `specification` tests, enforced by the D9
   redacted-mount-view (`docs/specs/HOLDOUT_REDACTED_MOUNT_SPEC.md`: held-out rows at an
   ungranted `.holdout/` scope, resolved only by the engine's host-brokered injection). D9 is
   worth building — it closes the *trivial* direct-`readFile` leak and the readdir/`exists`
   metadata leak (with deny-by-default fs enforcement, review-2 CODE-GAP A) — but it is
   honestly bounded: it does **not** close the **test-oracle channel** (the agent reads its
   authored test's result/trace over the holdout), and it adds little for low-parameter
   formulas. So holdout is presented as a **tripwire** (a held-out row that a later edit breaks
   is a useful regression signal) — never as the thing that certifies an inferred formula. The
   report's "the only example-based tests carrying genuine correctness weight" claim does *not*
   survive the oracle; the review surface must not show a holdout-only cell as validated.
4. **Independent authoring — with an honest limit** (review-2 D9-3). The assistant can invoke
   a second agent that writes specification tests and synthetic fixtures from a cell's *stated
   intent* (its `doc`), with its read view narrowed to the intent (D9 redacted-mount-view), not
   the implementation or fitting data. **But agent-1 authors that `doc`** — a complete intent
   over-determines the implementation (that is what a doc is *for*), so "independent
   reproduction from intent" is only as independent as the doc is under-specified, which the
   design cannot enforce. Independence is therefore a *weak* signal, not a strong lever; treat a
   second-agent-authored test as corroboration, not proof.
5. **Mutation testing is the primary teeth** (review-2 — promoted). Stryker-style over
   worksheet formulas, run outside the browser in CI: does the pinned suite kill mutants?
   Mutation score per cell feeds the review surface and is a **non-example-based, non-oracle,
   agent-uncircumventable** signal (the agent cannot fit to mutants it never sees) — which is
   why, with metamorphic/property, it carries the correctness weight holdout cannot.

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
  trust claim (RQ-E5) states a **reach** bound, not a *no-execution* bound (review-1 H1 —
  the earlier wording "runs none of the author's code" was literally false: a static report
  *does* run the author's formulas in the engine; what is true is that they run starved).
  Corrected claim, shipped last (M4) once true: *"The author's formulas run sandboxed —
  with no access to your files, accounts, or network. Live reports fetch only from sources
  you approve, and nothing here can reach your other data."* The provenance inspector (V3)
  lets a viewer watch those formulas compute, so the sentence must survive that scrutiny.
- **Value inspector (V3) is subgraph-legible, not one-hop-modal** (review-1 UX-4): walking a
  4-deep precedent chain one panel at a time is worse than Excel's spatial Trace-Precedents,
  so the inspector offers a whole precedent-neighborhood view alongside hop-by-hop. The
  brief's "≤2 taps from any value" acceptance means *opening* the inspector; *traversing* the
  chain is the neighborhood view, not N sequential taps.
- **Key user flows and UI design:** the enumerated flows (zero-consent open, params
  drill, value-provenance inspection via the cell inspector, histogram
  re-bin/`drillTo`, worksheet navigation, assistant/form/editor authoring paths, freeze
  moment) and the commissioned UI design live in the docs repo:
  `design-briefs/reckoner/00-reckoner-ui.md`, with the benchmark port case study
  (the Meridian SaaS exec-metrics workbook — also the E-1 bake-off corpus and an F1
  catalog stress test) in `design-briefs/reckoner/01-benchmark-case-study.md`.

### 7.1 Scope: report-authoring and delegation, not ad-hoc exploration (review-1 UX-1/UX-2)

The UX pass found a genuine regression for one of the three named users and it is scoped
out here honestly rather than papered over. **Reckoner is a reporting/authoring and
sharing tool, not an exploratory-analysis surface.** Two spreadsheet flows have *no*
equivalent and deliberately won't in v1:

- **No scratch / range-select-sum / multi-cell scan.** Every computation is a durable,
  named, declared, tested cell; there is no anonymous throwaway cell and no
  "select-a-range-and-read-the-sum-off-the-status-bar." Ad-hoc "poke at the data" work
  stays in a spreadsheet — Reckoner is where a *result* is authored, tested, and shared,
  not where a hypothesis is explored. (If usage shows this scope cut is untenable for the
  RevOps persona the case study invokes, the fix is a real ephemeral-cell scratch surface +
  a tabular multi-cell inspector — a booked *future* item, R-6, not a v1 hand-wave.)
- **Agent-first for non-trivial logic, and honest that the direct path is for simple
  edits + review.** Changing a *number* or an assumption (`static.*`, a `Params` widget) is
  first-class and instant. Changing *logic* by hand is a code-editing task (the quick-add
  form covers single aggregates only; beyond that is tested JS in the platform editor). The
  plan does **not** claim the direct hand-authoring path is a co-equal peer of the agent
  path for mid-complexity work — it is deliberately the delegate-or-review path. This is the
  "back-to-Excel" failure mode Problem 2 names, converted from an unadmitted risk into a
  stated scope choice.

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
- **Tier-consequential and gated actions** — **publishing to a shared space, source/component
  edits, feed-config edits, and fixture *capture*** (review-1 M4): routed through the
  attended full-diff gate (TS-19b), marked "will require your approval" before the agent
  accumulates twenty silent live edits. Fixture capture belongs here, not in the live class:
  it is a freeze that can refloor the document's tier (§5.4), so the agent must surface the
  tier consequence before it happens — a live-edit classification would let it capture M3
  rows silently.

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
finding. Load-bearing behaviors that must *not* rest on prompt discipline — holdout, blind
second-agent authoring — are enforced by the **D9 redacted-mount-view** (review-1 H3), not
by the prompt telling the agent not to peek; kind-weighted review is host-rendered in the
review surface regardless of what the agent claims. The prompt states these as facts about
the environment and is part of the surface E-6 (the RQ-A5 agent-loop gate) evaluates.

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

## 9. The platform workstream — nine deltas (PD-5, PD-6)

The safety of everything shared or live rests on these. Each row is a booked workstream
this program owns, with the spec's gate test as exit criterion. Nothing shared/live ships
while its gating rows are open.

> *(Adversarial-review-1, 2026-07-09 — D8 and D9 were added when the security pass showed
> the count was seven only by folding two unbuilt dependencies into other rows: per-instance
> `capDir` delegation (in D1) rides an unbuilt, design-pending launch-to-run capability (H4),
> and holdout enforcement (§6) needs a host mechanism the assistant's `rw@self` grant
> otherwise defeats (H3). See `ADVERSARIAL_REVIEW_1.md`.)*

| # | Delta | Repo(s) | Design status | Exit gate test | Gates |
|---|---|---|---|---|---|
| D1 | Ingestion taint / output tiering + per-instance `capDir` delegation (spec §4) | site-main (+ SDK fs surface) | designed (TRUST_MODES §5 ext.), unbuilt | ingestion-taint gate: M3-bound output arrives tagged M3; two instances of one connector `appKey` share no source grant | all live/shared |
| D2 | **Host-enforced connector egress-fixing (spec Q3)** — target-fixing/request-template layer + **pinned secret path** + **write-sink consent** | site-main + backend | **designed 2026-07-09, revised by review-2** (`docs/specs/CONNECTOR_EGRESS_FIXING_SPEC.md`). *Reach*-fixing sound; review-2 found the built proxy is **bypassed for secret feeds** (D2-F5), the write channel is **fast not a drip** (D2-F1), and an **author-hostile template** is uncontained by egress (D2-F4). Three additions booked | egress-fixing gate (reach: no request outside frozen templates) **+** secret-pin gate (secret feed rebind refused) **+** write-sink-consent gate (POST/body feed consented outbound with cell-refs). **Honest Q2: bounds a compromised connector to fast-slot-entropy write; does NOT make it or a hostile author zero-exfil** | all live |
| D3 | Non-executable-MDX safe renderer | immediately-run-sdk | designed + empirically verified (TRUST_MODES §5.1), unbuilt | `f={fetch("/x")}` captured as inert string; no evaluator in the pipeline | all rendering (M1) |
| D4 | Freeze/write-laundering enforcement (RS-10; rides R3-156 track) | site-main | designed direction, unbuilt | write-laundering gate: silent persist refused; explicit freeze refloors or is refused | freeze UX (M2), shared (M3) |
| D5 | Hardened sandbox profile (per-frame CSP delta on G1a) | sandbox, site-main | needs per-frame-CSP infra | connector frame: `connect-src 'none'` with `net:fetch` surviving via host proxy | live (M3) |
| D6 | Composite: manifest resolution, composite-aware powerbox (un-bundled TS-5b line, mobile one-member-per-card), inspector + aggregate reach view, **host-rendered tier/trust badges** (H2), **manifest↔launch-graph reconciliation** (L2) | site-main | net-new (spec §6) | powerbox tests (badge integrity, un-bundled elevated line); run-mode-first gate (static doc → zero powerbox, desktop + mobile); **reconciliation gate: an undeclared sandbox spawned under the composite root is flagged** (RS-9/RS-11); **tier badge is host-drawn, not app-emittable** | shared/live (M3) |
| D7 | **AA-01 program-identity `appKey`** (per-entry-point identity) | site-main | V2 design of record exists (AGENT_AUTHORING §5.1); unbuilt | sibling-isolation gate: two entry points of one repo hold disjoint grant bundles; engine entry point resolves to an empty bundle | realm isolation being real — anything shared (M2→M3 boundary) |
| D8 | **Launch-to-run / standing-app-lifecycle** (per-instance delegated launch + keep-warm/teardown that per-instance `capDir` delegation and composite lifecycle ride) | site-main | **design-pending** (STANDING_APP_LIFECYCLE §4.1/§5.1, Open Q#10; rides AA-01) | per-instance-delegation gate: two live instances of one connector `appKey` hold disjoint source grants and independent lifecycle | D1 per-instance tiering + D6 composite lifecycle (live/shared, M3) |
| D9 | **Redacted-mount-view for holdout** (held-out fixtures at an ungranted `.holdout/` scope; resolved only by the engine's host-brokered injection) + **deny-by-default fs** (review-2 CODE-GAP A: path-bearing/unmodeled methods like `exists` must throw, not pass through) | site-main (+ SDK fs surface) | **designed 2026-07-09, re-scoped by review-2** (`docs/specs/HOLDOUT_REDACTED_MOUNT_SPEC.md`); path-level, reuses `scopedFs` + `attenuateDelta` | holdout-enforcement gate: an agent with `rw@self` cannot read the withheld rows, list them via readdir, **or probe them via `exists`/`stat`** (G-HRM-1..6). **Honestly bounded** (review-2 D9-1): does *not* close the test-oracle channel — holdout is a tripwire, not a correctness proof (§6); the load-bearing signal is metamorphic/mutation | closes the *trivial* read leak; best-effort, not the testing linchpin (M2) |

The D2 design sprint ran 2026-07-09 → `docs/specs/CONNECTOR_EGRESS_FIXING_SPEC.md`. It found
the framing sharper than "undesigned": the **SSRF/DNS-rebinding/redirect-resistant proxy is
already built** (`immediately-run-backend/src/netFetch.ts` — resolve-all-addresses +
reject-if-any-private + pin, per-hop redirect re-validate, no credential forwarding,
size-bounded body), and the host already computes a `manifest ∩ grant` allowlist
(`netFetchPolicy.ts`). The report's RQ-E1 recipe (below) is therefore **implemented** for the
general `net:fetch` path. The genuinely undesigned part — now designed — is the **connector
target-fixing layer**: a metacircular connector still had per-call choice *inside* the
allowlist (which host, what body), so the connector holds a template-bound `feed:fetch`
capability (not general `net:fetch`), never passes a URL, and fires host-constructed request
templates derived from trusted feed config with only bounded typed data-plane params. The
adversarial pass (spec §5) walks the metacircular attack move by move; the TS-4 body residual
is shrunk to declared-param entropy and budget-tripwired, not closed. The built recipe it
composes with: allowlist of scheme+host+port;
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

- **D2 egress-fixing design sprint** → **done 2026-07-09**:
  `docs/specs/CONNECTOR_EGRESS_FIXING_SPEC.md`, with the metacircular-connector attack walked
  move-by-move (spec §5) and code-anchored to the built SSRF proxy. Finding: the proxy is
  built; only the connector target-fixing layer was undesigned, and it now is. Residual for
  the third fresh-agent pass: is the param-entropy + budget covert channel (spec OQ-3)
  tolerable for the M3-reach the connector already holds? Build of the target-fixing layer is
  M3 (with the connector realm).
- **F4 judge harness** built and calibrated: rubric, benchmark set, per-dimension κ vs.
  human raters. Exit: κ published per dimension; dimensions below agreement threshold are
  marked judge-unusable (human review required there).
- **B1 scheduler spike:** suspending-vs-restarting benchmark over synthetic graph families
  (deep chains, wide fan-out, diamonds, 10³–10⁵ cells); early-cutoff hit rate on typical
  edits. Exit: engine design note with measured numbers.
- **A1 bake-off (validation, PD-4 + the review-1 stdlib additions):** ~50 shaping tasks,
  three surfaces, driven from self-descriptions alone; measures first-attempt correctness,
  hallucinated-API rate, diff size — **plus the two review-1 metrics**: a **raw-loop /
  stdlib-fallback rate** (did the solution shape with stdlib primitives or escape to an
  imperative `.reduce`?) and an **edge-case-correctness axis** over the planted boundary
  fixtures (empty cohort, single-row customer, FX gap). Exit: numbers vs. the promotion
  rule; **a primitive hallucinated by ≥2 independent agents is an additive-inclusion
  candidate before the M1 freeze** (the mechanism that catches a still-missing family).
- **C1 transport rig:** the write-notify-read loop measured end-to-end (p95), rate × size
  × transport swept. Exit: the v1 envelope numbers.
- **AA-01 (D7) implementation start** in site-main (design of record exists); **D9
  redacted-mount-view designed** (`HOLDOUT_REDACTED_MOUNT_SPEC.md` — path-level, reuses
  `scopedFs`/`attenuateDelta`) and **D8 launch-to-run design** advanced far enough to unblock
  M2/M3.
- **E3 reach-view efficacy study designed and started** (review-1 M6): moved ahead of M4 so
  M3 sharing can gate on it (below), mirroring the F4-before-generation rule.

### M1 — The static core (first shippable: static dashboards, zero-consent)

**On "shareable" (review-1 M1):** M1 static reports *can* be shared, and this does **not**
contradict R-2's "nothing shared before D7" — because in M1 no realm holds Class-B caps,
egress, or an agent, and viewers get `ro`, so the shared-appKey fiction has nothing to grab.
Sharing that carries *live feeds or the assistant* waits for D7 (M2) and the D-row gates
(M3). M1's shareability is the static-only case, stated as *why* it is safe, not asserted
over R-2.

- Engine: SES compartment, worksheet loading, explicit-input injection, suspending
  scheduler with (value-hash, tier) cutoff, cycles-as-error, watchdog — including the
  review-1 recalc invariants: run-to-completion supersession (F2), error-as-lattice-value +
  host-side sticky watchdog memo (F6), conservative-set subset invariant (F1), atomic
  `(value,tier)` + epoch publication (F4), demand-driven live path (F5), tier
  monotone-per-session (F7), versioned atomic frame publication (F3), param conflation (F8).
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
- **AA-01 (D7) lands** — realm isolation becomes real. **D9 redacted-mount-view lands** —
  holdout and blind-authoring become host-enforced (before that they are prompt discipline,
  §6). Everything before D7/D9 in M2 is dev-mode only with respect to isolation and holdout
  claims, and **that window runs the author's *own* documents only** (review-1 M7): no
  third-party document is opened while the content-executing engine shares an appKey with
  the assistant's `llm:chat` grant, and demo/marketing material is forbidden from doing so —
  not merely required to "not claim isolation."
- **Exit gates:** RQ-A5 agent-loop gate (an agent completes create→declare→test→run→read
  failure→fix cold from the published catalog, zero out-of-catalog guesses); D7
  sibling-isolation gate; **D9 holdout-enforcement gate** (an inference-mode agent with
  `rw@self` cannot read the withheld rows); freeze-UX usability pass (users predict the tier
  consequence); F4-scored generation baseline published.

### M3 — The live, shared product

- Connector realm + feeds config; materialize-to-OPFS + notification; retention,
  conflation, freshness bound per the M0 envelope.
- Platform: **D2 egress proxy built** (gate test passing), D1 output tiering +
  per-instance delegation, **D8 launch-to-run/standing-app-lifecycle** (which per-instance
  delegation + composite lifecycle ride), D5 hardened profile, D6 composite powerbox +
  inspector + aggregate reach view + host-rendered tier badges (mobile-complete:
  one-member-per-card, connector as its own full-screen step).
- Tier-on-the-graph live end to end; over-tainting instrumentation on.
- **Exit gates:** all **nine** D-rows' gate tests green; the spec's must-establish table
  (spec §13) green in CI; C1 envelope published in docs; **E3 reach-view efficacy result in
  hand and M3 sharing gated on it** (review-1 M6 — the sole confidentiality-legibility
  mechanism does not ship as load-bearing against an uncalibrated ruler; if E3 shows the
  new-total reach view does not improve detection, the shared path is held/redesigned before
  live ship); mobile real-device pass for consent + drill-down (emulators insufficient,
  platform practice).

### M4 — Hardening, measurement, and the trust claim

- Mutation-score CI signal; the D5 four-arm injected-bug study (characterization-only /
  +holdout / +metamorphic / full loop) with plausible mis-inferences in the corpus —
  target ≥80% catch on the full loop; if holdout+metamorphic catches <60%, the
  publish-to-shared path gains a mandatory second-agent specification-test gate (report
  threshold).
- E3 consent A/B *final verdict* (the study started in M0 and gated M3; M4 writes the
  durable comprehension result), E2 over-taint verdict written, E4 real-device consent
  validation.
- Viewer trust claim (§7, corrected to the reach/starvation wording — review-1 H1) shipped
  in chrome — last, once true.
- Third fresh-agent adversarial pass on the spec + this plan's implementation deltas
  (this document is adversarial-review-1; the spec's requested third pass runs against the
  D2 design-sprint output — §9).

### Sequencing rationale in one line each

- F4 before any generation claim: the report's non-negotiable (uncalibrated rulers).
- E3 before M3 sharing (review-1 M6): the reach view is the *sole* confidentiality-legibility
  mechanism and confidentiality is the one property that must hold — the same uncalibrated-ruler
  logic as F4, applied to the more dangerous property.
- D2 design in M0 even though the proxy ships in M3: undesigned + load-bearing means its
  design risk must be retired first, not discovered late.
- Freeze/fixtures in M2 not M3: infer-then-fortify makes capture mainline (report D4).
- AA-01 + D9 inside M2: the last point where "realms share an appKey" and "holdout is
  prompt discipline" are honest, because M3 is where strangers' documents and real
  credentials arrive.

### In-platform-completable work items (dogfooding, §0.2)

Tags: ✅ fully in-platform now · ◐ in-platform once this milestone's engine/deltas land · ✗
needs S4/S5 (external CI/deps until self-hosting closes the gap).

- **M0** — ✅ the F4 rubric/benchmark authoring, the spec/design docs, the case-study `.xlsx`
  design and the porting plan (content/markdown). ✗ the B1/C1 spikes and the A1 bake-off harness
  (Node benchmarking). ✅ *the D2/D9/Spine-1 design specs themselves were authored in-platform-style
  (markdown) — a proof of layer-1 dogfooding.*
- **M1** — ◐ **document content** (worksheets, templates, fixtures, the Meridian workbook) authored
  in the editor + agent, rendered live; ◐ **document test runs** become in-platform *by
  construction* the moment the engine lands (S2). ✗ the engine/report-view **source** CI gates
  (build/lint/vitest — S4) stay external; source *editing* is ✅ (S1).
- **M2** — ◐ the assistant realm *is* the in-platform authoring agent (dogfooding the agent on
  its own document); ◐ freeze/fixture-capture and the review surface exercised in-platform. ✗
  mutation-testing CI (S4).
- **M3** — ◐ running the **real four-realm composite** in-platform becomes possible as D1–D9 land
  (S6, the recursion resolves here); the connector/tiering/powerbox are exercised on the host,
  not a stub.
- **Cross-cutting self-hosting asks** surfaced by the above: **S4** (an in-platform Node-equivalent
  gate) and **S5** (dep resolution for SES/CodeMirror) are the two gaps that keep source-level work
  external; booking them is the Axis-2 forcing-function contribution. **S3** (in-platform
  commit/push via the editor's VCS surface) is partial and worth closing early — it removes the
  last routine reason to leave the platform for content work.

---

## 11. Experiments and thresholds (booked, with owners in the milestone plan)

| ID | Experiment | Decides / validates | Threshold that changes a call |
|---|---|---|---|
| E-1 | A1 surface bake-off (M0) + **raw-loop-fallback rate** + **edge-case axis over planted fixtures** (review-1 DSL-meta) | PD-4 validation; catch a still-missing stdlib family before the freeze | SQL-hybrid ≥10 pts better first-attempt AND comparable diff auditability → promote to co-equal surface; **any primitive hallucinated by ≥2 agents → additive-inclusion candidate before M1 freeze**; high raw-loop rate on a task class → missing primitive |
| E-2 | B1 graph benchmark + glitch property test (M0/M1) **plus targeted tests the random-DAG/single-edit harness cannot catch — hardened after review-2 found the review-1 five certified only happy paths**: (i) **running-feed steady-state** freshness on a depth-`d` chain, assert the *composed* `d·max(c,e)` bound (not just "settles when input stops"); (ii) dynamic-dependency cycle via selector indirection **+ a param-produced-by-cell edge and a computed namespace token**, assert static SCC / publish-time enumerability catches each (C-4); (iii) cross-realm frame-race, assert no torn read; (iv) **shared-ancestor asymmetric-async-arm glitch** (B slow, C fast, ancestor re-fires mid-flight), assert the common-epoch barrier holds — D never mixes epochs (C-R-B, the single most important gap); (v) **live-feed divergence** — a diverging cell driven by a *live* feed (fresh input-hash each tick), assert the per-cell circuit breaker quarantines it, other cells keep progressing, and the memo stays bounded (C-R-A); (vi) **soft-timeout recovery** — a transient load-induced timeout, assert it does *not* permanently poison the cell (C-3) | scheduler liveness + glitch-freedom under a *live* feed, not just the value model | p95 ≥ 100 ms @ 10⁴ cells (or cold full-recompute budget on the join-heavy sheets) → revisit (subgraph partitioning first, never SAB); any liveness test livelocks/hangs/leaks → the progress invariant is wrong, not just slow |
| E-3 | Early-cutoff hit-rate on realistic edits (M1) | whether hashing pays | hit rate ~0 on real workbooks → keep hashing only at snapshot boundaries |
| E-4 | C1 transport sweep (M0) | v1 live envelope | loop exceeds freshness budget at ≤30 Hz mid-size → tiered message bus moves into M3 |
| E-5 | F4 per-dimension κ (M0) | which dimensions judges may score | κ below threshold on a dimension → human review required for that dimension |
| E-6 | RQ-A5 agent-loop gate (M2) | catalog self-description quality | any out-of-catalog guess → description iteration before ship (descriptions rot; budget for it) |
| E-7 | D5 four-arm injected-bug study (M4) | test-loop teeth | full loop <80% or holdout+metamorphic <60% → mandatory second-agent gate on publish |
| E-8 | E2 over-taint instrumentation (M3→M4) | tier granularity | >~20% shareable reports over-tainted by one non-flowing input → build per-column tiers |
| E-9 | E3 consent A/B + comprehension — **started M0, gates M3, verdict M4** (review-1 M6) | aggregate-reach presentation; **whether the sole reach-bound legibility works before it ships live** | new-total consent fails to improve detection → **hold/redesign the shared path before M3 live ship**, not after |
| E-10 | F6 edit-instruction benchmark (M2) | iteration loop format | <90% targeted-diff success → tighten template determinism / fall back whole-file more aggressively |

---

## 12. Risks and open questions

**Carried from the platform spec (not re-opened here):** Q1 composite spec spin-out; Q2
sufficiency of the egress-fixing + tiering backstop pair against a metacircular-connector
fork; Q4 the connector's elevated slot (open vs. first-party-restricted); Q5 high-frequency
bus; Q6 freeze-refloor UX surprise; Q7 owners for mobile surfaces. Q3 is now the M0 design
sprint (D2).

**Plan-specific risks:**

- **R-1 (schedule, from PD-1):** **nine** platform deltas gate M3; **all now have a design
  of record** (D2 → `CONNECTOR_EGRESS_FIXING_SPEC.md`, D9 → `HOLDOUT_REDACTED_MOUNT_SPEC.md`,
  both 2026-07-09) — the remaining risk is build-and-integration, not design discovery.
  The dependency itself is intentional — Reckoner is the forcing function for these platform
  capabilities (§1), so "blocked on platform work" is the program working as designed, not
  a planning failure. The residual risk is purely schedule-shaped, and the fallback is
  explicit: if a design sprint uncovers a blocker, the **genuinely-safe public fallback is
  M1 only** (static, no assistant, no egress) — *not* "M1/M2" (review-1 M1), because M2's
  isolation depends on D7 and its holdout on D9. M1 as the public product with authoring and
  live held behind the gates is a scope cut, not a redesign.
- **R-2 (isolation honesty, from PD-6):** between M1 and AA-01/D9 landing, the four "realms"
  share an appKey — which means the content-executing engine effectively shares the
  assistant's `llm:chat` egress (review-1 M7, a concrete exfil path, not an abstract one).
  In that window Reckoner runs the **author's own documents only**: no third-party document
  is opened, and dev/demo/marketing material is *forbidden* from running one — stronger than
  "must not claim isolation." Nothing shared ships before D7's gate is green.
- **R-3 (generation quality, from PD-3):** if M0's κ shows judges unusable on core
  dimensions, generation still ships but its quality bar rests on human evaluation
  throughput — slower iteration, same gate.
- **R-4 (scale ceiling):** pure-client-side calc has a documented ceiling. Connectors
  pre-aggregate; a size budget per pulled frame is enforced with a visible flag, not a
  silent truncation.
- **R-5 (additive-only stdlib):** a mis-designed stdlib function can never be removed.
  The v1 surface stays deliberately small (§3.2); every addition needs the anti-affordance
  review + self-description eval. Tension with the review-1 additions: adding the
  window/as-of/date families *before* the M0 bake-off trades bake-off-validation for
  freeze-safety — accepted because a missing family is permanent and the additions are the
  boring, well-benchmarked SQL set (they replace loops, not expand scope).
- **R-6 (UX regression for the solo hand-author, review-1 UX-1/UX-2):** core spreadsheet
  flows (scratch cells, range-select-sum, multi-cell scan, in-place hand-authoring of
  non-trivial logic) have no v1 equivalent — a real regression for one of the three named
  users, scoped out in §7.1 rather than resolved. If usage shows the RevOps persona won't
  accept the scope cut, the fix (ephemeral scratch surface + tabular multi-cell inspector +
  a wider structured no-code path) is a booked future item, not a v1 hand-wave. Named here
  so it is not the one un-scrutinized corner it was in the pre-review draft.
- **R-7 (recalc liveness, review-1 F2/F6 — now mitigated, tracked):** the engine's value
  model was always sound; its *liveness* rested on invariants the earlier draft left
  implicit. Those are now stated in §4.1/§4.2 (run-to-completion supersession; error-as-value
  + host-side sticky watchdog memo; atomic pair publication) and gated by the five E-2
  liveness tests. Risk downgraded from "possible livelock" to "invariants must be verified
  by the E-2 additions before M1 exit."

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
- **Viewer trust claim: a *reach/starvation* bound, not a *no-execution* bound, shipped
  last (review-1 H1).** *Rejected:* "runs none of the author's code" (literally false — a
  static report runs the author's formulas, starved); over-claiming "safe" (Gatekeeper
  pattern); shipping the sentence before it is true.

### Decisions from adversarial review 1 (2026-07-09)

Recorded so they are not relitigated; full findings in `ADVERSARIAL_REVIEW_1.md`.

- **Expand the stdlib now** with the window/as-of/date/null families (DSL-1/2/3/5/6), ahead
  of the M0 bake-off. *Rejected:* holding for the bake-off to decide — a raw `.reduce` passes
  on fitting data so the bake-off could under-surface the gap, and the additive-only freeze
  makes a missing family permanent. Mitigation kept: E-1 gains a raw-loop-fallback metric and
  an edge-case axis so a *still*-missing family is caught before the freeze.
- **Book D9, a host redacted-mount-view, to make holdout real (H3).** *Rejected:* leaving
  holdout/blind-authoring as "harness-enforced" when the assistant's `rw@self` over the
  fixtures defeats it (that is prompt discipline mislabeled as enforcement); silently
  downgrading the testing story's strongest leg.
- **Scope Reckoner as report-authoring-not-exploration, agent-first for logic (UX-1/UX-2),
  §7.1.** *Rejected:* pretending the direct hand-author path is a co-equal peer for
  non-trivial logic; building the scratch/multi-cell surfaces in v1 (booked as R-6 instead).
- **Gate M3 sharing on the E3 reach-view efficacy result (M6).** *Rejected:* shipping the
  sole confidentiality-legibility mechanism in M3 and validating it only in M4 — the
  uncalibrated-ruler pattern the plan forbids for generation, on the more dangerous property.
- **Book D8 (launch-to-run) and count nine deltas, not seven (H4).** *Rejected:* folding
  per-instance delegation's unbuilt lifecycle dependency into D1 and under-counting the
  unbuilt platform surface.
- **State the recalc liveness invariants (F1–F8) explicitly** — run-to-completion
  supersession, error-as-lattice-value, conservative-set subset, atomic `(value,tier)` + epoch,
  demand-driven live path, tier handling, versioned atomic frame publication, param conflation.
  *Rejected:* "sound because pure" as a stand-in for a progress argument (it proves values
  correct, never that one lands). *(Several of these were themselves corrected by review-2 —
  see below.)*

### Decisions from adversarial review 2 (2026-07-09)

The third fresh-agent pass attacked the D2/D9 design sprints and the review-1 recalc fixes
with code anchors; three findings were premise-level and decided by the user. Full findings in
`ADVERSARIAL_REVIEW_2.md`.

- **Re-scope holdout to a best-effort regression/tripwire; metamorphic + property + mutation
  are the load-bearing correctness signal (review-2 D9-1/D9-2, §6).** *Rejected:* keeping
  holdout as "the only example-based correctness weight" (the test-oracle channel — the agent
  reads its own test's result/trace over the holdout — and affine-formula reconstruction defeat
  it for the mainline); building a full bandwidth-bounded output-channel policy over all test
  results/traces just to save holdout (bigger than path separation, still beaten by
  reconstruction); dropping holdout entirely (it is a useful *tripwire*, worth D9's best-effort
  defense).
- **The engine guarantees glitch-freedom and accepts depth staleness; per-cell `max(c,e)`
  freshness and glitch-freedom are mutually exclusive under a continuous feed (review-2 C-R-B,
  §4.2).** *Rejected:* claiming both (impossible on an asymmetric diamond); fast-but-glitchy
  with an "updating" marker (gives up the glitch-freedom the proposal asserted, on numbers
  people act on). Chose the common-epoch barrier; freshness = critical-path-depth · max(c,e),
  stated honestly.
- **Full D2 revision now** — author-hostile template in the threat model + write-sink consent,
  secret feeds back on a pinned path, the opaque-cursor/§1 contradiction resolved, the residual
  restated as a fast write-channel (review-2 D2-F2/F4/F5, `CONNECTOR_EGRESS_FIXING_SPEC.md`).
  *Rejected:* honesty-fixes-now-redesign-later (the holes are BLOCKERs on the load-bearing
  backstop; a "known-BLOCKERs" marker is not enough for the one delta everything shared rests
  on).
- **Recalc corrections (review-2, applied §4.1/§4.2/§5.3/§11):** per-cell **circuit breaker**
  replaces the `(cell,input-hash)` sticky memo (which never hit under a live feed → live
  relaunch livelock + unbounded-memo DoS); **soft vs hard** timeout split (never memoize a
  wall-clock outcome as pure-in-inputs); **common-epoch barrier** for glitch-freedom;
  freshness bound corrected to **depth·max(c,e)**; **`params.*` are leaves** + **literal
  namespace tokens** (enumerability); **user-consent tier elevation permitted mid-session**
  (only *autonomous* changes are monotone). *Rejected:* the review-1 formulations, which closed
  each per-cell failure and relocated the composition failure.
- **Two shipped-code bugs filed, not folded into a spec** (review-2): the SSRF blocklist's
  `fe80`-only IPv6 link-local (misses `fe80::/10`) in `netFetch.ts`/`netFetchPolicy.ts`, and the
  `filteredFs`/`scopedFs` fail-open method allowlist (`exists`/unmodeled path methods bypass the
  classifier) in site-main — real platform bugs surfaced by the pass, tracked separately from
  the Reckoner design.
