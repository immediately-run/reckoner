# Reckoner Convergence — the explicit fixed point, the cell-kind decision, and the reopening criterion

**Status:** proposal — the design spike R3-379 owed; the **go/no-go is recorded in §4** (helper-only, with a named reopening criterion) · **Updated:** 2026-08-27

> **Reads first:** [`ENGINE_INFORMATION_FLOW_SPEC.md`](ENGINE_INFORMATION_FLOW_SPEC.md)
> (the epoch × tier × egress-channel contract any diagnostics channel must ride),
> [`../LBO_GAP_CLOSURE_PLAN.md`](../LBO_GAP_CLOSURE_PLAN.md) §1 W6/W7 (the plan that
> split this into helper-first, design-second), the gap analysis
> [`../LBO_CASE_STUDY_GAP_ANALYSIS.md`](../LBO_CASE_STUDY_GAP_ANALYSIS.md) §2 G1 (the
> finding), and the shipped evidence: `src/stdlib/fixpoint.ts` (R3-378) + its
> port-forward in `docs/case-study/caldera/document/worksheets/model.sheet.js`
> (`debt_schedule_avg`).

---

## 1 — The problem, restated once

Real financial models contain genuinely circular calculations — average-balance
interest is the canonical one: interest → cash flow → sweep → ending balance →
interest. Excel's answer is iterative-calculation mode: circular references converge
*invisibly*, or silently degrade to zero / oscillate — a famous silent-error class that
commercial audit tooling exists specifically to catch. Reckoner's scheduler rejects
cycles outright (correctly — an acyclic graph is what glitch-free recalc, tier folding,
and trace replay all rest on), so convergent calculations must be expressed some other
way.

## 2 — What already shipped (the evidence this decision reads)

R3-378 shipped `fixpoint(initial, step, {tol, maxIterations}) → { converged,
iterations, value }` and the Caldera case study's `debt_schedule_avg` uses it:

- **Convergence** — the helper returns the fixed point.
- **Visible failure** — the port *throws* on `converged: false` ("average-balance
  interest did not converge in year N"), which the engine surfaces as a cell error on
  the result channel: the opposite of Excel's silent behavior.
- **Evidence as data** — the iteration count travels **in the cell's value** (the
  schedule rows carry `iterations`), which means it is inspectable in the value
  inspector, diffable, and — uniquely — **testable**: the case study's
  `sched_avg_converges` property test asserts on it.
- **Budget** — a fixed-point loop inside one formula's evaluation is bounded by the
  engine's existing per-eval wall-clock watchdog; a divergent step terminates the eval,
  trips the circuit breaker, and quarantines the cell exactly like any other runaway
  formula. No new accounting exists or is needed at this scale (200-iteration caps,
  µs-per-step loops).

## 3 — What a converged *cell kind* would add, honestly

A first-class `convergedCell({...})` constructor could add, beyond §2:

| Capability | Helper-only today | Cell kind | Verdict |
|---|---|---|---|
| Convergence + visible failure | ✓ (helper + throw convention) | same | no delta |
| Iteration counts surfaced | as data in the value (testable, diffable) | on a trace channel (ENGINE_INFORMATION_FLOW `(epoch, tier)`-tagged) | the channel is *metadata*; the data form is strictly more expressive for documents; a channel would matter only for cross-cell dashboards nobody has asked for |
| Non-convergence as a lattice error | throw → cell error on the result channel (dependents see the propagated error) | first-class error kind | same observable behavior; a new kind adds taxonomy, not behavior |
| Budget accounting across many converged cells | each eval under the per-eval watchdog; no aggregate view | a per-cell iteration budget the scheduler tracks | an aggregate view with no consumer; per-eval watchdog already bounds the real risk (runaway) |
| Cross-cell dependency on the *converged state* | impossible (intra-cell by design — the graph stays acyclic) | could publish the fixed point as a cell value others depend on | expressible today by splitting the model (one cell converges and *returns* the state; dependents consume it) — the Caldera port proves the pattern |
| Versioning | n/a | a new constructor = stdlib addition + derived `compat.stdlib` floor bump for documents using it | pure cost until there is a consumer |

## 4 — The decision (go/no-go, against the named criterion)

The criterion set by the plan: **implement the cell kind only if a real document needs
convergence *diagnostics* — iteration counts surfaced in the review surface, budget
accounting — not merely convergence.**

**Decision: helper-only, recorded (no-go on the cell kind).** The only real consumer
(Caldera) needs convergence, visible failure, and evidence-as-data — all shipped in
§2 — and none of the §3 deltas have a consumer. The throw-on-non-convergence
convention is hereby pinned as **the idiom** (see §5) so authors do not re-derive it.

**Reopening criterion** (any one reopens this decision, as a fresh design item against
then-current evidence):

1. A document wants **review-surface convergence telemetry for many converged cells at
   once** (a "how hard did this workbook converge" surface) — the case where
   threading counts through values is impractical and a trace channel earns its keep.
2. A converged calculation whose step is **too expensive for one eval budget** (e.g.
   per-step cost near the watchdog limit), needing scheduler-visible progress or
   budget splitting.
3. A consumer needs **the fixed point as a first-class graph node** with its own tier,
   epoch, and dependents — i.e. convergence spanning cells rather than inside one.

## 5 — The pinned idiom (normative while this spec stands)

A convergent calculation is expressed as:

```js
import { fixpoint } from "@reckoner/stdlib";

const fp = fixpoint(initialState, step, { tol: 1e-12, maxIterations: 200 });
if (!fp.converged) throw new Error("<what> did not converge <where>");
// fp.iterations travels in the VALUE (inspectable, diffable, testable)
```

Rules:

- **Throw on non-convergence** — never return the last iterate as if it were the
  answer; never log-and-continue (there is no console in the compartment by design).
- **Carry the evidence in the value** — iteration counts (and residuals, when the
  author has them) are data, not diagnostics; tests can and should assert on them.
- **The step is pure** and must not read anything but its argument (the compartment
  enforces this structurally anyway).
- **Budget**: the default 200-iteration cap stands unless the model justifies more;
  the per-eval watchdog is the outer bound either way.

## 6 — Adversarial self-review of the decision (the each-pass-attacks-its-prior rule)

**Attack 1 — "helper-only is complacent; Excel users get iteration counts *without*
authoring discipline, so the helper will be misused and non-convergence hidden."**
The attack assumes authors can silently ignore `converged: false` and return the last
iterate. They can — the helper permits it — which is why §5 pins the throw idiom as
normative and why the catalog self-description says it. A cell kind could enforce the
throw structurally; that is a real (if small) delta, and it is the strongest argument
_for_ the cell kind. Rejected because: the same "author can write it wrong" objection
applies to every stdlib callable (an author can also return `0/0` as `null` where a
throw was owed); the mitigation is review-surface tests on convergence (exactly what
Caldera's `sched_avg_converges` demonstrates) plus the pinned idiom, not a new engine
surface. Recorded as the likeliest reopening pressure.

**Attack 2 — "iteration counts in values pollute the data model; downstream cells must
strip them."** True in principle (a consumer of `debt_schedule_avg` sees an extra
column); in practice the counts are additive columns that `Table`/charts ignore unless
bound, and the alternative (a side channel) makes them invisible to the one consumer
that matters — tests. Standing.

**Attack 3 — "the decision reads one case study; finance has other convergent shapes
(circular working capital, goal-seek-coupled models) that may want the cell kind."**
Conceded as the honest limit: n=1 consumer. This is exactly why §4's reopening
criteria are behavioral (telemetry at scale, step cost, cross-cell fixed points)
rather than feature-shaped — a second case study with a different shape reopens the
question on evidence, not taste.

## 7 — Versioning note

No new constructor ships with this decision, so no stdlib compat consequence beyond
what R3-378 already recorded (`fixpoint` is additive). A future cell kind would be a
new callable (additive) whose *use* in a document derives a higher `compat.stdlib`
floor per `DOCUMENT_VERSIONING_SPEC` §3 — nothing here pre-decides that API.
