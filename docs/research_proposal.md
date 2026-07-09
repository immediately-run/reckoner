# Reckoner — Research Proposal

**Status:** draft · **Updated:** 2026-07-09

> Companion to [product_definition.md](product_definition.md) and
> [problem_statement.md](problem_statement.md). This document collects the **open research
> questions** those two documents raise, groups them into workstreams, and proposes how to
> attack each: candidate approaches, the experiment or prototype that would decide between
> them, and what "answered" looks like. Security-architecture questions inherited from the
> platform spec ([REPORTING_SPREADSHEET_SPEC.md](REPORTING_SPREADSHEET_SPEC.md), local copy —
> canonical in the immediately.run docs repo) are cross-referenced rather than restated;
> where that spec has already **closed** a decision (its §9 "Decisions & rejected
> alternatives"), this proposal does not relitigate it.

## Scope and method

Every question below is answerable by building something small and measuring it — a spike, a
harness, an evaluation — before Reckoner commits to a design. The working method follows the
platform's ways of working: spike → recorded findings → spec section with a
`Decisions & rejected alternatives` entry → adversarially reviewed before being declared
settled. Questions are labeled **RQ-\<group\>\<n\>** and tagged with the problem they serve
(**P1** security isolation, **P2** formula authoring/correctness, **P3** generated design —
per the problem statement).

What is **out of scope** here because the platform spec already closed it: confidentiality
as reach-not-egress; the four-realm decomposition itself; the starved evaluator; connectors
as dumb pipes; the non-executable-MDX renderer as the template substrate; composite members
as binding-resolved roles. Those are premises, not questions.

---

## Workstream A — The formula API (P2, P1)

*What exactly does a formula see, and how does it name what it needs?*

### RQ-A1 — What is the right API surface for JS formulas?

The tension: rich enough that agents and humans express real report logic without
hand-rolled loops; small enough to learn, audit, and keep stable forever (the platform's
additive-only compatibility rule will apply to it).

- **Candidates:** (a) minimal core — a formula is `({inputs}) => value` over plain JS
  values, plus a small standard library for shaping (group/join/window/aggregate/pivot);
  (b) dataframe-centric — inputs arrive as a typed columnar table object with a fluent query
  API; (c) SQL-hybrid — tabular shaping is expressed in SQL strings over registered inputs,
  JS only for scalar/glue logic.
- **Experiment:** take ~20 representative report-logic tasks (cohort retention, currency
  normalization, top-N with "other" bucket, period-over-period deltas, sessionization…);
  implement each three times; have both humans and coding agents author them cold from the
  API's self-description alone. Measure: correctness on first attempt, tokens/keystrokes,
  hallucinated-API rate, reviewability of the resulting diff.
- **Answered when:** one candidate wins on agent first-attempt correctness without losing
  badly on human ergonomics, and the standard library's scope is enumerated with a
  documented "not in v1" list.

### RQ-A2 — How are dependencies declared, and how strictly are they checked?

Recalculation (Workstream B), taint tiering, testing, and caching all consume the dependency
set. Arbitrary JS hides its reads.

- **Candidates:** (a) explicit declaration — a cell names its inputs, and the evaluator
  injects exactly those, so an undeclared read is *unnameable* rather than merely forbidden;
  (b) recorded evaluation — inputs are proxied, actual reads are traced, and the recorded
  set becomes the dependency edge (with re-trace on change); (c) static analysis of the
  formula source, with (a) as fallback where analysis is inconclusive.
- **Note:** (a) is the security-friendly default (matches the starved-evaluator posture: the
  engine receives its inputs and nothing else); the research question is whether its
  ceremony is tolerable and how (b)'s dynamic dependencies (a formula that reads
  `cells[region]` for a viewer-picked region) get expressed within it — parameterized
  dependencies, dependency patterns, or first-class "input cell" indirection.
- **Answered when:** the chosen scheme handles the dynamic-dependency cases from the RQ-A1
  task set with no silent-staleness hole (undeclared read ⇒ loud failure, proven by test).

### RQ-A3 — How do data feeds appear to formulas?

Feeds are materialized by connectors (platform spec §4.3: a host-tiered mount, streaming =
materialize + change notification). What does the *formula* see?

- **Candidates:** a frozen snapshot value per recalculation (feed = just another input,
  purity preserved); an explicit window/frame abstraction (`feed.window('1h')`) so time is a
  declared input; a query handle the formula filters *before* materialization (pushes work
  toward the connector but blurs the dumb-pipe boundary — likely rejected on P1 grounds,
  needs writing down).
- **Answered when:** the same feed semantics work for the pulled case (lookup-on-demand) and
  the live case (streamed) with only cadence differing, and the purity story (RQ-A4)
  survives.

### RQ-A4 — What enforces (or approximates) formula purity?

Same-inputs-same-output is load-bearing for tests, recalculation, and reproducibility;
JavaScript cannot guarantee it.

- **Candidates & layering:** environment starvation (no ambient I/O — already the design);
  frozen/structurally-shared inputs; virtualized nondeterminism (clock/randomness available
  only as declared inputs, so "now" is a cell); double-evaluation spot checks in CI/tests
  (evaluate twice, compare) to catch internal-state leakage.
- **Answered when:** a written taxonomy of impurity classes exists with, for each: prevented
  / detected / accepted-residual, and a test harness demonstrating the detected class.

### RQ-A5 — How is the API self-described to agents?

The platform lesson is explicit: a tool that is listed but lacks a parameter schema gets
mis-called by models. Every formula-authoring surface (cell CRUD, test run, stdlib) needs
typed, schema-carrying self-description.

- **Experiment:** drive the full authoring loop (create cell, declare deps, write tests,
  run, read failures, fix) with a real agent using only the published catalog — the
  platform's "tool-in-list ≠ tool-callable" gate test, applied to Reckoner's own catalog.
- **Answered when:** an agent completes the loop cold with zero out-of-catalog guesses.

---

## Workstream B — Recalculation: correct and efficient dependent-cell evaluation (P2)

*When a cell or a feed changes, what recomputes, in what order, how fast?*

### RQ-B1 — What is the recalculation algorithm over the dependency graph?

Given dependency edges (from RQ-A2), recalculation must be **correct** (glitch-free: no cell
ever observes a mix of pre- and post-change inputs; topological evaluation; deterministic
results) and **incremental** (change one input ⇒ recompute only its transitive dependents).

- **Candidates:** classic dirty-marking + topological sweep (the spreadsheet standard);
  reactive/incremental-computation frameworks (Adapton/Incremental/Signals-style, which the
  JS ecosystem now has mature primitives for); build-system semantics (à la *Build Systems
  à la Carte* — Reckoner's needs map to a suspending scheduler with early cutoff).
- **Key sub-questions:** early cutoff (dependent recompute skipped when a recomputed value
  is unchanged — needs cheap equality: structural hashing? immutable snapshots?);
  cancellation/restart when inputs change mid-evaluation of an async formula; scheduling
  fairness so one expensive cell doesn't freeze the report.
- **Experiment:** implement dirty-marking-with-cutoff and a signals-based engine over the
  same synthetic graph family (wide fan-out, deep chains, diamond patterns, 10³–10⁵ cells);
  measure recompute latency vs. change locality; inject adversarial orderings to hunt
  glitches.
- **Answered when:** one engine meets a stated budget (e.g. p95 < 100 ms recompute for a
  single-cell edit on a 10⁴-cell workbook) with a glitch-freedom property test passing.

### RQ-B2 — How are cycles handled?

Spreadsheets allow opt-in iterative calculation; notebooks forbid cycles.

- **Position to validate:** cycles are an error, reported with the full cycle path, always —
  iterative/fixpoint calculation is out of scope for v1 (converging financial models are the
  known cost; record it). The research task is only to confirm the RQ-A1 task set never
  legitimately needs fixpoints, then close this in a Decisions section.

### RQ-B3 — Where does evaluation run, and what is the parallelism model?

The formula engine is one starved realm — but is it one JS thread?

- **Candidates:** single evaluator context (simple, serial); a worker pool of identical
  starved evaluators with the scheduler partitioning independent subgraphs; per-worksheet
  workers.
- **Coupling:** memory model for shared inputs across workers (structured-clone cost vs.
  `SharedArrayBuffer` availability under the sandbox's opaque-origin/COOP-COEP reality —
  needs a platform-constraints spike first).
- **Answered when:** measured speedup on the RQ-B1 graph family justifies (or kills) the
  added complexity, under real sandbox constraints.

### RQ-B4 — How does recalculation interact with taint tiering?

Each result carries a host-assigned trust tier = floor of its inputs (platform spec §4.2).
Tier propagation is *also* a graph computation.

- **Question:** does tiering ride the same dependency graph and scheduler (one traversal,
  two products), and what happens on a mid-session tier change (the spec's
  flush-then-restart) — how much recomputation does that force, and can cutoff soften it
  without laundering?
- **Answered when:** a design exists where the tier of every rendered value is provably the
  floor of its transitive inputs, with a property test over random graphs.

---

## Workstream C — Streaming and live data (P2, P1)

*How does "live" actually work, end to end?*

### RQ-C1 — What is the ingestion transport, and where does it stop being enough?

The platform spec commits v1 to materialize-to-mount + change notification (human-timescale)
and defers a tiered message bus. Reckoner needs the concrete numbers behind that boundary.

- **Experiment:** benchmark the mount path (connector writes frame → notification → engine
  reads → recompute → render) for update rates from 0.1 Hz to 100 Hz and frame sizes from
  1 KB to 10 MB; find the knee. Define the v1 supported envelope from data, not vibes.
- **Answered when:** the envelope is published ("live means ≤ N Hz / ≤ M KB per feed in
  v1"), and the trigger condition for building the deferred message bus is written down.

### RQ-C2 — What are the windowing and retention semantics?

A live feed is unbounded; formulas and mounts are not.

- **Questions:** who owns retention (connector config: keep last N / last T)? Are windows a
  connector concern (materialize exactly the window) or a formula concern (RQ-A3's window
  API over a longer buffer)? What happens to a chart bound to a feed whose buffer expired?
- **Answered when:** one retention model covers the RQ-A1 streaming tasks and the mobile
  reconnect case (backgrounded tab rejoins a stream) without unbounded storage.

### RQ-C3 — What is the recompute cadence policy under streaming?

Recomputing the full dependent subgraph per frame is wasteful; batching adds latency.

- **Candidates:** debounce/coalesce per feed (mirrors the platform's editor-debounce
  lesson: coalesce the *write*, keep recompute immediate); fixed-tick scheduling
  (recompute at display cadence); dependency-aware adaptive batching.
- **Answered when:** a policy keeps end-to-end freshness within a stated bound (e.g.
  ≤ 500 ms at the v1 envelope) without saturating the evaluator, measured on the RQ-C1 rig.

### RQ-C4 — Freeze semantics: how does a live value become a durable one?

The platform spec resolves the security side (evaluator results are ephemeral; explicit
"freeze" refloors the target's tier or is disallowed — its RS-10/RB-2). The open questions
are **product**: what does freeze look like (paste-values per cell? snapshot-the-workbook?),
how is the tier consequence communicated so down-tiering a personal sheet doesn't surprise
users (spec open question Q6), and how do *tests* use frozen frames as fixtures without the
fixture capture itself laundering tiers (couples to RQ-D4)?

- **Answered when:** a freeze UX prototype passes a small usability pass where users
  correctly predict the tier consequence before confirming.

---

## Workstream D — Testing and debugging across the sandbox boundary (P2, P1)

*The evaluator is deliberately starved and opaque; authors still need to see inside.*

### RQ-D1 — What is the test-execution model?

- **Design position to validate:** tests are cells (same evaluation environment, same
  dependency machinery — a test is a formula whose value is a structured pass/fail report),
  vs. a separate runner realm. Tests-as-cells gets incremental re-running (only tests whose
  transitive inputs changed re-run) for free from Workstream B.
- **Answered when:** the RQ-A1 task set's tests run incrementally with correct
  invalidation, and a full-workbook test run is one command/tool call for agents and CI.

### RQ-D2 — How do diagnostics get out of a realm that must not talk?

Errors, stacks, `console.log`, timing — needed by authors, forbidden as a general egress
channel.

- **Candidates:** a host-owned structured diagnostics channel (the evaluator can emit only
  a typed, size-bounded, host-tiered diagnostic record — data, never instructions — surfaced
  only in the authoring UI, never in shared-view mode); source-map resolution performed
  host-side so the engine never fetches maps; capping/sampling to prevent the channel
  becoming a covert high-bandwidth exfil path (it is still Class-A-bounded reach, but tier
  it anyway).
- **Security framing:** the diagnostics channel is an *output* channel like the result
  channel — it inherits the same host-assigned tier floor (Workstream B4), which is what
  keeps it from being a laundering hole.
- **Answered when:** an author sees a source-mapped stack for a thrown formula within the
  normal edit loop, and an adversarial test shows the channel is bounded (rate, size,
  recipients) per the threat model's harness conventions.

### RQ-D3 — What does interactive debugging look like without DevTools?

The sandboxed evaluator's realm is not attachable from the author's DevTools in any
supported way.

- **Candidates (layered, cheapest first):** rich structured errors + logging (RQ-D2) — may
  be 90% of need; trace-based debugging — record an evaluation (inputs, intermediate
  stdlib-call results, output) and replay/inspect it *outside* the sandbox in the authoring
  UI, which purity (RQ-A4) makes sound; a deliberate "debug evaluator" mode where the
  author runs *their own* formula in a less-starved context with an explicit "this runs
  with your authority, on your machine, for your code only" framing — attractive but needs
  a P1 review before it is even prototyped, since it reintroduces exactly the
  evaluation-with-capabilities combination the architecture exists to prevent.
- **For agents:** trace-replay is likely *more* useful than a stepping debugger (agents
  consume structured traces well); validate with the RQ-A5 agent-loop experiment.
- **Answered when:** authors (human and agent) can diagnose the three classic failures —
  wrong value, thrown error, unexpectedly-stale value — without leaving the platform, on a
  real workbook.

### RQ-D4 — Where do test fixtures come from, and what tier are they?

Testing feed-dependent formulas needs captured frames; capture moves real (possibly
sensitive, possibly low-trust) bytes into the document.

- **Questions:** is fixture capture a freeze operation (inheriting RQ-C4's refloor
  semantics)? Should the system offer synthetic-fixture generation (schema-derived or
  agent-authored) as the *default*, keeping real-data capture the explicit, tier-conscious
  exception? How does a shared workbook's test suite run for a viewer who has no consent to
  the underlying feed (fixtures make tests runnable without the feed — that is a feature,
  state it)?
- **Answered when:** the fixture lifecycle (capture → tier → store → run → refresh) is
  specified with no laundering path, and agents can generate synthetic fixtures for the
  RQ-A1 task set.

### RQ-D5 — Can tests be made hard for the authoring agent to game?

If the agent writes both formula and tests, vacuous tests are the failure mode ("assert
result is defined").

- **Candidates:** coverage/assertion-quality visibility in the review surface (make
  weakness legible rather than trying to forbid it); independent test-authoring — a second
  agent writes tests from the cell's *stated intent* without seeing the implementation
  (judge-panel pattern); property-based testing support in the stdlib (agents are good at
  stating properties like "conservation: bucketed totals sum to the unbucketed total");
  mutation testing as an offline CI signal (do the tests kill mutants of the formula?).
- **Experiment:** run the RQ-A1 task set with deliberately-injected formula bugs; measure
  each candidate's catch rate and cost.
- **Answered when:** the shipped default loop catches a stated fraction (target ≥ 80%) of
  the injected-bug corpus.

---

## Workstream E — Security mechanisms the product depends on (P1)

*These extend the platform spec's own open list (its §12); Reckoner is the forcing function
and first consumer. The spec's question numbers are cited.*

### RQ-E1 — Host-enforced connector egress-fixing (spec Q3 — undesigned, load-bearing)

The single most load-bearing gap in the platform spec: the guarantee that a connector —
even a malicious fork interpreting feed bytes — cannot fetch beyond its host-fixed targets.

- **Candidates to evaluate:** grant-time target binding (the `net:fetch` grant itself
  carries the frozen host list; the host proxy rejects everything else — likely the shape,
  but redirect chains, DNS rebinding, and wildcard-subdomain semantics all need the SSRF
  treatment the platform's proxy already applies); per-instance fetch budgets (rate/volume
  ceilings per feed as an anomaly tripwire, acknowledging the body-exfil residual TS-4
  remains).
- **Answered when:** a design doc passes adversarial review with the metacircular-connector
  attack explicitly walked through, and a hostile-connector harness test exists (the spec's
  "egress-fixing gate").

### RQ-E2 — Output tiering as implemented machinery (spec §4 — designed, unbuilt)

The ingestion taint contract needs a concrete host implementation: per-instance delegated
`capDir` mounts, host-assigned floors, monotone-per-session with flush-then-restart.

- **Reckoner-specific question:** granularity. Is one tier per feed-instance enough, or do
  real dashboards immediately hit the over-tainting residual (one M3 feed floors the whole
  report) hard enough to need per-column/per-region tiers? Measure on realistic mixed-trust
  workbooks before adding granularity.
- **Answered when:** the two gate tests in the platform spec's must-establish table pass,
  and the over-tainting measurement has a written verdict.

### RQ-E3 — The aggregate reach view (spec RS-11 — unbuilt, and the consent-fatigue answer)

Per-feed delta consent reintroduces fatigue; the reach bound is only as strong as the
user's ability to see the accumulated total ("this dashboard now reads 9 sources").

- **Research question (UX + security):** what presentation actually changes user decisions?
  Candidates: a persistent reach badge on the report chrome ("9 sources · 2 elevated");
  a volume/velocity signal ("3 new sources this session"); consent screens that show the
  *new total*, not just the delta.
- **Experiment:** scripted consent-fatigue scenario (a fork requesting many plausible
  narrow feeds) in a usability study; measure at what point users notice with vs. without
  the aggregate view.
- **Answered when:** a presentation measurably improves detection in the scenario, and it
  ships as part of the composite inspector design.

### RQ-E4 — Composite consent on mobile (spec Q7 / RB-4)

One-member-per-card progressive disclosure, the elevated connector line as its own
full-screen step, never buried below benign members — the spec books the requirement; the
open work is the concrete design and a real-device validation pass (emulators lie about
exactly the surfaces involved).

### RQ-E5 — What does the *viewer* trust story say, in one sentence?

Product-level synthesis question: the honest platform answer is layered ("static reports
run nothing of the author's; live reports are bounded by what you consented; residuals X,
Y"). Find the one-sentence viewer-facing claim that is both true and reassuring — the
platform's rule that no policy may rest on the user *reading* a disclosure applies; this is
about not over-claiming, not about informed-consent theater.

---

## Workstream F — LLM-generated report templates (P3)

### RQ-F1 — What belongs in the template component catalog?

The catalog is simultaneously the security boundary (non-executable, closed), the design
system (good defaults), and the model's vocabulary.

- **Method:** corpus-driven — collect ~50 real-world report/dashboard exemplars (good and
  bad); determine the minimal component set that expresses the good ones; every component
  gets typed attributes, built-in responsive/theme/accessibility behavior, and an
  explicit *anti-affordance* review (what ugliness or unsafety does adding it enable?).
- **Answered when:** the catalog expresses ≥ 90% of the good-exemplar corpus and an
  enumerated "expressible only via fork components" remainder is accepted.

### RQ-F2 — Message-finding: how does the pipeline decide what the report should say?

Separating analysis ("what matters in this data") from layout is the design position; the
question is what the analysis stage is.

- **Candidates:** an agent pass over the workbook with a structured brief as output
  (audience, key question, the 1–3 findings, supporting breakdowns) that the layout stage
  must honor; statistical screening (trend/outlier/magnitude detection as *tools* the
  analysis agent calls, so "what changed" is computed, not guessed); author-in-the-loop
  brief confirmation for high-stakes reports.
- **Answered when:** ablation shows brief-then-layout beats direct one-shot generation on
  the RQ-F4 rubric by a stated margin.

### RQ-F3 — How is restraint encoded?

- **Candidates (compose):** catalog ceilings (bounded palette, one type scale, chart types
  that don't exist can't be misused — no 3D pie); generation-time style constraints (a
  house style contract the layout agent must satisfy, checkable mechanically where possible:
  max distinct accent colors per view, max tiles per viewport, minimum text-to-ink ratio);
  critique-and-revise loops (a judge pass that specifically hunts decoration, applying a
  written "does this element serve the message?" test).
- **Answered when:** the mechanical style checks exist and the judge pass measurably
  reduces rubric-scored chartjunk without collapsing variety into monotony (check: visual
  diversity across a batch of generated reports).

### RQ-F4 — How is report design quality measured?

The evaluation harness everything in this workstream hangs off.

- **Build:** a rubric (message clarity, hierarchy, chart-form appropriateness, restraint,
  responsive integrity, theme integrity, accessibility) with anchored score descriptions;
  a benchmark set of (workbook, audience, expected-message) inputs; LLM judge panels scored
  against a human expert calibration set — measure judge–human agreement *first*, and only
  trust judges where agreement is demonstrated; regression tracking so template-generation
  changes show rubric deltas before shipping.
- **Answered when:** judge–human agreement is quantified per rubric dimension and the
  benchmark runs as a routine evaluation.

### RQ-F5 — Does generated design survive the phone?

Every generated template is evaluated at phone viewport and both themes as part of RQ-F4 —
plus a real-device pass for touch drill-down (emulator-insufficient per platform practice).
The open design question: does the layout stage emit one responsive template (catalog
components own the adaptation) or per-form-factor variants (more model control, more
divergence risk)? Default position: one template, catalog-owned adaptation; falsify it on
the benchmark if the rubric shows mobile scores lagging.

### RQ-F6 — What does the iteration loop look like?

First generations won't be final. "Make churn lead, drop the pie, tighten the header" must
be cheap, targeted edits — which requires generated templates to be *stable and readable
artifacts* (deterministic structure, human-scale diffs), not regenerated wholesale per
request.

- **Answered when:** an edit-instruction benchmark (20 revision requests) completes with
  targeted diffs (small, reviewable, non-destructive of unrelated sections) ≥ 90% of the
  time.

---

## Prioritization and sequencing

Dependencies, not dates. Three phases, each gated on named exits (platform practice:
enforcement before authority, adversarial review before "settled"):

**Phase 1 — foundations (can start now, mostly in parallel):**
- RQ-A1/A2 (API + dependencies) and RQ-B1 (recalculation) — the product's core loop; B1's
  engine choice consumes A2's dependency model, so run A2 first or co-design.
- RQ-F1 + RQ-F4 (catalog + evaluation harness) — the harness must exist before any
  generation-quality claims.
- RQ-E1 (egress-fixing design) — the platform spec's single most load-bearing gap; design
  work can proceed independent of Reckoner's own prototypes and gates everything shared.
- RQ-D1/D2 (tests-as-cells + diagnostics channel) — co-designed with A1/B1.

**Phase 2 — the authoring experience (needs Phase 1's engine and API):**
- RQ-A5 (agent-drivability gate), RQ-D3 (debugging), RQ-D5 (ungameable tests),
  RQ-F2/F3/F6 (generation pipeline against the F4 harness).
- RQ-C1–C3 (streaming envelope + cadence) on the real engine.

**Phase 3 — the shared/live product (needs the security backstops):**
- RQ-E2 (output tiering built), RQ-C4 + RQ-D4 (freeze + fixtures, which depend on tiering),
  RQ-E3/E4 (aggregate reach + mobile consent), RQ-F5 real-device pass, RQ-E5 (the viewer
  claim, written last because it must only state what is by then true).

**Standing exit criterion for the whole proposal:** a question is *answered* only when its
finding is recorded (spike report → spec `Decisions & rejected alternatives` entry) and, for
anything security-relevant, an adversarial harness test exists — per the platform's
ways of working. Findings that change the platform spec's premises go back to the canonical
spec in the immediately.run docs repo, not just to this repo's local copy.

## Known unknowns beyond this list

Honesty note: this proposal covers the questions visible from the product definition and
problem statement today. Areas known to harbor more questions once the above are opened:
collaborative editing semantics of a workbook two authors touch concurrently (the platform's
Regime A/B conflict model applied to cells and templates); workbook-level versioning and
"which numbers did we report last quarter" reproducibility; importing existing spreadsheets
(formula translation is explicitly *not* promised); catalog/formula-stdlib versioning across
long-lived shared documents; and quota/cost behavior of LLM-heavy authoring under
bring-your-own-key. These are parked, not denied.
