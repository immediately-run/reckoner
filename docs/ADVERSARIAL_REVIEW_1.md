# Reckoner — Adversarial Review 1 (fresh-agent pass)

**Status:** review record — four independent fresh-context passes, 2026-07-09 · **Updated:** 2026-07-09

> Records the first adversarial review of `ARCHITECTURE_PLAN.md`,
> `assistant/FORMULA_AUTHORING_PROMPT.md`, and the two design briefs
> (`docs/design-briefs/reckoner/`). Four reviewers ran cold and in parallel:
> **Security** (weighted hardest, per request), **UX-vs-spreadsheet**, **DSL
> expressiveness**, **Recalculation concurrency**. This document is the durable
> finding record; dispositions (fix applied / decision owed) are tracked in the
> table at the end and, once applied, in the plan's own `Decisions` section.

## Consolidated verdict

- **Security posture is HONEST but drifts:** faithful to the spec's §9 closed decisions
  (no executor-detection revival, `capsEnvelope` legibility-only, reach-not-egress,
  ephemeral-compute, dumb-pipe, un-bundled consent all correctly carried). The failure
  mode is **present-tense confidence in §3.3/§7/§9 and the prompt** that outruns the
  spec's deliberately-hedged posture — the same class of overclaim the spec's own RB-1/RB-10
  passes caught at the spec layer, reintroduced at the implementation layer.
- **Recalc value model is sound; liveness is under-proven.** The suspending/pull scheduler
  with `(value-hash, tier)` cutoff is the right, boring choice and it genuinely closes the
  headline "dynamic dependency defeats static cycle detection" hazard. But it is
  "soundness-complete and liveness-incomplete": two real livelocks exist as written.
- **DSL is under-scoped for its own benchmark.** The stdlib covers the *reductive* half of
  the case study cleanly but has **no primitive for the ordered/relational-across-rows half**
  (month-over-month, running totals, as-of join, date math) — exactly the logic that then
  collapses to the hand-rolled reduce loops the design exists to prevent.
- **UX is a net win for viewers and agents, a net regression for the solo hand-author** —
  and that regression is the one corner of an otherwise self-critical plan that escaped
  scrutiny.

**The shared through-line all four found independently:** the plan's honesty is quarantined
to §1/§12; the mechanism sections drift into confidence a mechanism that is unbuilt,
fork-weakenable, or contradicted by a capability the same design grants cannot support.

---

## A. Security (primary pass)

**HIGH**

- **H1 — the shipped viewer trust claim is literally false.** §7/§13 commit "Static reports
  run none of the author's code in your browser" to product chrome. A static report *runs
  the author's worksheet formulas* in the engine — that is the premise. The true claim is a
  *reach* bound, not a *no-execution* bound; as worded it is never true, and it is exactly
  the Gatekeeper over-claim §13 says it rejects. **Fix:** reword to the reach/starvation
  bound ("the author's formulas run sandboxed and starved of network, files, and secrets").
- **H2 — tier badges are drawn by untrusted app surfaces, so the trust signal is forgeable.**
  §3.3 + brief 00 surfaces 2/3 render the tier badge inside Reckoner's own inspector/cell
  cards. A malicious fork receives `tier=M3` and renders an M1 badge or none. Trust-signaling
  chrome must be host-owned (threat_model T15/T47). "Coordinate the vocabulary" ≠ "the host
  draws it." **Fix:** tier/trust badges on values must be host-rendered, like the reach badge
  the brief already reserves a slot for.
- **H3 [BLOCKER] — holdout and blind-second-agent authoring are unenforceable against the
  assistant's own `rw@self`.** §6/§8.3 make them "harness-enforced, not prompt discipline,"
  and the prompt's rationale leans on that. But the assistant holds `worktree:rw@self` over
  the document, which *contains* `fixtures/`. An agent that can read the fixture files can
  read the withheld rows directly; the "second agent that never sees the fitting data" runs
  with read access to the document holding it. Both anti-circularity mechanisms — holdout is
  the *only* example-based correctness weight; blind authoring is "the strongest lever" —
  collapse back to prompt discipline, the exact failure the rationale claims to have
  engineered away. **Fix requires a real mechanism:** a harness-mediated **redacted mount
  view** during inference (the agent's read tool returns only the training split). This is
  not a free consequence of G12 and fights the standing `rw@self` grant — a design question,
  possibly a new platform delta.
- **H4 — the "seven deltas" undercounts; launch-to-run is a hidden eighth, design-pending.**
  §9 folds per-instance `capDir` delegation into D1, but the spec is explicit that it *rides*
  an unbuilt launch-to-run/standing-app-lifecycle delta (spec §4.3, §6.3, §8 — "V2,
  design-pending"), which also gates D6's composite lifecycle. It has no row, owner, or exit
  gate. **Fix:** book it as its own delta (D8) or state why per-instance delegation + composite
  lifecycle can ship without it.

**MEDIUM** (all doc-corrections)

- **M1 — internal contradiction:** §10 M1 header says "shareable"; §12 R-2 says "nothing
  shared ships" before D7 (which lands in M2). Reconcile (static-share is *probably* fine
  because no realm holds Class-B caps in M1 — say *that*, don't assert both). Also R-1's safe
  fallback is **M1 only**, not "M1/M2" — M2's isolation depends on D7.
- **M2 — "safe by grammar" over-generalizes** template safety to the whole dashboard; opening
  a stranger's dashboard *runs their formulas* (safe by starvation + unbuilt backstops, i.e.
  the fork-weakenable app discipline). Scope the sentence to templates; cross-ref §3.2.
- **M3 — §9 says D2 design "already fixed by the report"** while §1/M0 correctly call it
  undesigned and load-bearing. Align §9 down to the spec's posture (recipe known; host-enforced
  form undone).
- **M4 — prompt/plan contradiction:** the prompt lists fixture writes as un-gated "live
  edits"; §5.4 makes fixture *capture* a tier-consequential freeze (refloor-or-refuse).
  Move fixture capture to the prompt's gated/consequential class.
- **M5 — trace replay moves M3 intermediates "outside the sandbox" with no tier/confinement.**
  Diagnostics inherit tier + caps; traces (which can carry M3 feed data) must too. State it.
- **M6 — the reach-bound's only strength (aggregate reach view) ships in M3, but its efficacy
  (E3/E9) isn't validated until M4** — shipping the sole confidentiality-legibility mechanism
  against an uncalibrated ruler, the very pattern the plan forbids for generation (F4-first).
  Confidentiality is "the one property that must hold," so this ordering is *more* dangerous.
  **Decision owed:** gate M3 sharing on E3, or state why an unvalidated reach view is
  acceptable at ship.
- **M7 — the shared-appKey pre-D7 window gives the content-executing engine the assistant's
  `llm:chat`** — a live Class-A exfil path reachable by the *engine*, not just the assistant.
  "Dev-only" is one demo away from violation. **Fix:** make the M2-pre-D7 window explicitly
  own-documents-only, and forbid running third-party documents in it (not just "must not
  claim isolation").

**LOW:** L1 fixture safety mis-attributed to the file tag (§3 itself calls it advisory —
credit the D4 mount refloor); L2 add the undeclared-sandbox reconciliation gate to D6;
L3 prompt injection-relay (report *that* injection-shaped text was present, don't echo it);
L4 specify host-side validation of viewer param writes; L5 watchdog must bound async
wall-clock, not just sync CPU.

**Held up:** cutoff over `(value-hash, tier)` with tier=floor-over-input-tiers; diagnostics
tiering + host-side source maps + rate-cap; ephemeral-compute/freeze-refloor; un-bundled
consent; run-mode-first; the prompt's abstention emphasis.

## B. Recalculation concurrency

Framing: the plan proves **soundness** (purity ⇒ correct value) everywhere and **liveness**
almost nowhere; "sound because pure" is repeatedly asked to stand in for a progress argument.

**BLOCKER**

- **F2 — cancellation-on-restart livelock when eval time > conflation interval.** §4.1 cancels
  an in-flight eval when inputs change; §5.3 conflates feed *arrival* to one-per-interval but
  "no debounce-the-recompute." A formula with eval time `e` > conflation interval `c` is
  cancelled at every tick and **never completes** while the feed updates. The published
  freshness bound ("conflation + one recompute + one paint") is only valid when `e ≤ c`,
  which the plan cannot assert. **Fix:** a bounded-cancellation / **run-to-completion with
  single-slot supersession** progress guarantee; state the bound as `max(c, e)`.
- **F6 — single-context + worker-boundary watchdog: one synchronous runaway tears down every
  suspended eval and can relaunch into livelock.** A `while(true){}` can only be stopped by
  `worker.terminate()`, which destroys *all* in-flight state and in-memory memo in the single
  context. On rebuild the runaway's inputs are unchanged → re-demanded → spins again →
  **relaunch livelock**; and suspended dependents waiting on the killed cell **hang** if
  "ready" means "has a value." **Fix:** (1) error is a first-class lattice value that resolves
  suspended waiters; (2) watchdog verdict persisted **host-side**, keyed by `(cell,
  input-hash)`, so a rebuilt worker doesn't re-run a known-diverging cell; (3) own the
  single-context blast radius explicitly.

**MAJOR** (state the omitted invariant)

- **F1 — dynamic-dependency cycle is PREVENTED** by the conservative-namespace over-approximation
  — but the plan never states the load-bearing invariant: *the runtime dependency set of any
  cell is a subset of its statically cycle-checked conservative set; the scheduler never
  suspends on an edge outside it.* Also requires every namespace to be statically
  enumerable, and owns a false-positive-cycle cost (a `focus` selector + a summary tile that
  references it is a *static* cycle with no `INDIRECT()` escape) that needs a diagnostic.
- **F3 — cross-realm torn-frame read.** Connector writes frames via an OPFS sync access
  handle; engine reads on notification. Nothing specifies atomic publication; OPFS sync
  handles are exclusive-lock. **Fix:** versioned/content-addressed frame publication (new
  path per frame, notification carries the frame id, engine opens *that* id) — makes "frozen
  snapshot" true at the byte level and gives conflation its implementation.
- **F4 — value/tier desync under flush-then-restart overlapping a value recompute** (async
  interleaving in the single context). A subscriber can momentarily observe (new value, stale
  tier) — a one-frame trust-mislabel, the laundering the pair rule exists to prevent,
  reintroduced at *publication* rather than *cutoff*. **Fix:** `(value, tier)` is one atomic
  result record; epoch/generation stamp so superseded async results are dropped, not published.
- **F5 — live path is described in push terms** (§5.2/§3.3) while the glitch-freedom proof
  needs pull. **Fix:** state that live updates re-enter the *same demand-driven scheduler* (a
  feed change is a dirty signal; D is rebuilt once after inputs settle; components subscribe
  to the settled result, never to per-arm notifications).
- **F7 — flush-then-restart termination rests on tier monotone-per-session**, which is in the
  *proposal* (line 329) but **dropped from the plan**. Without it, a re-raisable tier can
  oscillate like F2. **Fix:** carry the invariant verbatim; specify a tier that *should* rise
  waits for a new session, never mid-session.
- **F8 — param write path is unconflated into the calc.** A dragged slider emits 60–120 Hz
  writes, each scheduling a recompute in the single context → F2's livelock, user-driven, not
  covered by *feed* conflation. **Fix:** param writes share the feed keep-latest conflation +
  progress guarantee.

**On the property test (E-2):** as described (random DAG + single-cell edit) it re-confirms
what the paper already guarantees and is *structurally incapable* of catching F1–F8 (no
timing, no async, no cross-realm, no worker lifecycle, no selector indirection). Add five
targeted tests: liveness/termination, dynamic-dependency cycle, cross-realm frame-race,
concurrent tier+value, watchdog-under-single-context.

## C. DSL expressiveness

Almost nothing is *inexpressible* (full JS in the body), so the right severity lens is the
plan's own stated failure mode: a missing affordance → hand-rolled reduce loop agents get
subtly wrong.

**BLOCKER (only via the hand-rolled loop the design condemns)**

- **DSL-1 — no window-function family** (`lag`/`lead`, `scan`/`cumulative`). Hits running/
  cumulative retention, EMA, period-over-period, and **sessionization** (which the RQ-A1 set
  names *and* RQ-B2 cites as proof cycles-as-error suffices — the same task proves the scan
  gap). Everything collapses to a mutable-accumulator-in-`.map`.
- **DSL-2 — no as-of/carry-forward join for the FX gap.** `join` is equality-only; the
  monthly-FX-with-holes → carry-forward-last-known-rate needs an inequality/nearest-preceding
  join. The plan's own §3.1 example dodges this by joining FX on `currency` only (no time
  axis). The case study *plants* the FX-gap fixture. **Fix:** `asofJoin`.

**MAJOR (awkward enough to hurt agent first-attempt correctness)**

- **DSL-3 — MRR waterfall needs full-outer/anti-join + composite keys.** `join` is inner/left
  only, so *churned* (present M-1, absent M) requires a second reverse join + filter, and
  `on:["customer","month"]` composite keys are unspecified. High first-attempt-wrong. **Fix:**
  `join how:"full"` / `antiJoin` + documented composite `on`.
- **DSL-4 — cohort % is an ordering trap:** pivot-first forces an `Object.keys` loop over
  dynamic columns; normalize-first is clean. No new callable — needs a self-description
  example that steers normalize-before-pivot.
- **DSL-5 — date/time arithmetic is pervasive, fragile, and UNACKNOWLEDGED** (not even on the
  "deliberately absent" list). "Months since signup," fiscal periods, `last-90d` are in every
  sheet; SES leaves explicit `Date` math available, so it all becomes hand-rolled epoch/string
  arithmetic (the most bug-prone domain). **Fix:** a small pure date stdlib (`monthsBetween`,
  `monthKey`, `addMonths`/`addDays`, `fiscalPeriod`, `resolveRange`). Verges on BLOCKER for
  agent correctness.
- **DSL-6 — empty-group / div-by-zero / null semantics undefined.** What `rollup` returns for
  an empty group is unmade, and it "breaks or saves downstream formulas" (NRR with an empty
  cohort → `start=0`; quick ratio denominator 0). Worse, if fitting fixtures lack an empty
  group the NaN never fires and characterization tests are green by construction (the D5
  mis-inference class). **Fix:** document empty-group returns; add `coalesce`/`safeDiv`. Do
  this before freeze regardless.

**MINOR:** DSL-7 `topN` tie + other-bucket multi-measure semantics unspecified; DSL-8
`window` naming collides with "window function."

**Fixpoint verified, not falsified:** no case-study sheet is circular; RQ-B2's claim holds —
but *workbook-specifically*. The first integrated three-statement/runway model (circular
interest, CAC-payback, deferred-revenue true-up) reopens it.

**Meta (freeze-blocking):** E-1 measures first-attempt correctness / hallucinated-API /
diff-size — but a raw `.reduce` **passes on fitting data**, so the walls score as "passable
correctness" and the additive-only freeze happens with the gap intact. **Add to E-1:** a
raw-loop / stdlib-fallback-rate metric, an edge-case-correctness axis over the planted
boundary fixtures, and a rule that a primitive hallucinated by ≥2 independent agents is an
additive-inclusion candidate *before* the M1 format freeze.

## D. UX vs. spreadsheet

**BLOCKER (net regression for the solo hand-author in a core flow)**

- **UX-1 — no exploratory-analysis or multi-cell-scan surface.** The highest-frequency
  spreadsheet gesture (select a range, read the sum/avg off the status bar) and the grid's
  see-many-cells-at-once value have no equivalent; every computation is a durable, named,
  declared, tested artifact, and the inspector shows one binding at a time. Acknowledged only
  obliquely ("not a grid clone"), never resolved. **Decision owed:** scope Reckoner explicitly
  as not-an-exploratory-tool (exploration stays in a spreadsheet), or design a real scratch
  affordance + tabular multi-cell view and roadmap it.
- **UX-2 — the non-conversational path for non-trivial edits is "write tested JavaScript."**
  The quick-add form is single-aggregate only; none of the case study's real logic fits it,
  so the human who won't converse with an agent hand-writes JS in a separate editor. The
  agent path is the smooth one; the direct human path is the fallback dressed as a peer — the
  exact "back-to-Excel" failure Problem 2 names but the architecture doesn't resolve.
  **Decision owed:** commit to agent-first honestly, or widen the structured no-code path well
  past single aggregates.

**MAJOR:** UX-3 the edit→render *loop* (edit→save→transpile→SES eval→render + editor-here/
result-there switch) is unbudgeted — only the recompute sub-step is (add an authoring-loop
latency budget + cold-transpile spike); UX-4 the provenance inspector is serial/modal where
Excel's trace is spatial/simultaneous (add a whole-subgraph view; reconcile the "≤2 taps"
acceptance line with multi-hop walking); UX-5 named-cells imposes an *ongoing* authoring tax
(naming every intermediate; range-thinkers re-learn joins) booked only as one-time port
friction; UX-6 the flagship exec-summary sheet isn't fully expressible in v1 (heatmap has no
component — the planted probe; growth-vs-target is dual-axis, excluded; waterfall has no
component) yet acceptance says "renders the full deck" — rewrite to "renders with dispositions
recorded"; UX-7 "make the default look intentional, not sparse" hand-waves the
catalog-too-restrictive risk — make it an F4-measured item against the Meridian deck.

**MINOR:** UX-8 the conservation test catches reconciliation breaks, not plausible-but-wrong
splits that still reconcile (don't oversell it); UX-9 the recompute budget is in cells (10⁴)
but Meridian's cost is data-volume-dominated (budget both); UX-10 param drill is visibly
non-instant where a native slicer isn't (name it).

**Verdict:** improvement for viewers (safe zero-consent share, live drill, provenance+tier
inspector Excel can't offer) and decisively better for agents; **net regression for the solo
hand-author** — and, unlike the security/testing risks the docs interrogate ruthlessly, that
regression got a pass. Not a regression *dressed* as progress (the dressing is honest), but a
real one hiding in the un-scrutinized corner.

---

## Disposition tracker

**Apply as doc-corrections (validated, no decision needed):** H1, H2, H4, M1, M2, M3, M4,
M5, M7, L1–L5; recalc F1, F2, F3, F4, F5, F6, F7, F8 (state the invariants + the two progress
guarantees); E-2 five added tests; DSL-4, DSL-6 (null semantics), DSL-8; E-1 metric additions;
UX-3, UX-4, UX-6 (acceptance reword), UX-7, UX-8, UX-9, UX-10.

**Decisions owed (product/scope/platform — do not apply unilaterally):**

1. **DSL surface expansion (DSL-1/2/3/5):** add the ~5 window/as-of/date/full-join primitives
   to the committed v1 stdlib before the additive-only freeze? (Expands PD-4's surface.)
2. **H3 holdout enforceability [BLOCKER]:** commit to a harness-mediated redacted-mount-view
   mechanism (likely a new platform delta), or downgrade holdout/blind-authoring from
   "harness-enforced" to "prompt discipline" and re-weight the testing story accordingly?
3. **UX-1 / UX-2 scope:** add a scratch/exploration surface + widen the direct no-code
   authoring path, or explicitly scope Reckoner as report-authoring-not-exploration and
   agent-first-for-logic?
4. **M6 sequencing:** gate M3 sharing on the E3 reach-view efficacy result, or ship the
   unvalidated reach view and accept the residual?
