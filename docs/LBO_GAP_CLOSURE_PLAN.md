# Reckoner — LBO gap-closure plan

**Status:** plan / proposal — sequenced work items W1–W10 across milestones M0–M4, derived from the Caldera case study's gap analysis (`LBO_CASE_STUDY_GAP_ANALYSIS.md`, merged 2026-08-27); nothing here is scheduled · **Updated:** 2026-08-27

> **Reads first:** [LBO_CASE_STUDY_GAP_ANALYSIS.md](LBO_CASE_STUDY_GAP_ANALYSIS.md)
> (the gaps G1–G9 this plan closes), the case study itself
> ([`case-study/caldera/`](case-study/caldera/) + its proof harness
> `src/document/calderaCaseStudy.test.ts` — the standing acceptance corpus for
> most items below), [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §3.2 (the
> committed stdlib, additive-only forever), §6 (testing architecture),
> [DOCUMENT_VERSIONING_SPEC.md](specs/DOCUMENT_VERSIONING_SPEC.md) (the compat
> envelope every stdlib/catalog addition rides), and the current wiring the
> items touch: `src/engine/testrunner.ts`, `src/engine/asyncEngine.ts`
> (`runTests`/`#inputsFor`), `src/engine/worker/engineWorker.ts` (`runSuites`),
> `src/stdlib/relations.ts`, `src/document/manifest.ts`.

This plan turns the gap analysis into buildable, gated work. Ordering principle:
**bug-level fixes before primitives before designs before measures** — G6 is a
wiring bug against the architecture plan's own §3.1 example and unblocks the
holdout-test pattern everything else wants to use; the stdlib additions (G5, G2)
are additive and cheap *now* but permanent once frozen, so they come early; the
converged-cell design (G1) and the sweep-construct decision (G4) are gated on
cheap predecessors that may make the expensive version unnecessary.

---

## 0 — Summary

| # | Gap | Item | Kind | Milestone | Size | Exit gate (one-line) |
|---|---|---|---|---|---|---|
| W1 | G6 | Wire `substituteInputs` into the test run | build | M0 | S | a holdout + a fixture-oracle test in Caldera pass through the real engine |
| W2 | G7 | Tolerant invariance comparisons; selective `scaleInvariance` | build | M0 | S | adversarial float-reorder fixture passes; Caldera invariance tests unchanged-green |
| W3 | G5 | `rollforward` + `cumprod` stdlib primitives | build | M1 | M | Caldera debt schedule + growth paths expressed with them, oracle-green |
| W4 | G2 | Financial family: `irr`, `npv`, `xirr` | build | M1 | S–M | Caldera returns use `irr`; parity vs the hand-rolled bisection |
| W5 | G9 | Assumptions-as-params (`paramRefs` in the manifest) | build | M2 | M | `tax_rate` flipped live in the running app; only dependents recompute |
| W6 | G1a | stdlib `fixpoint` helper (formalize the intra-cell loop) | build | M2 | S | `debt_schedule_avg` uses `fixpoint`; convergence test unchanged |
| W7 | G1b | Converged-cell design spike → spec | design | M3 | M | spec reviewed; go/no-go on the cell kind (helper-only is a live option) |
| W8 | G4 | Sweep idiom: measure-first via the assistant | measure | M3 | S | agent authors the sensitivity cell from self-descriptions alone, or the construct is justified |
| W9 | G3 | `solve` (1-D monotone bisection helper) | build | M4 | S | `breakeven_exit_multiple` uses `solve`; parity vs hand-rolled |
| W10 | G8 | Display formats (`multiple`, units, column formats) | build | M4 | S | the deal summary renders 2.75x / EUR m / (1,234) without bespoke cells |

Dependency edges: W1 → (W2, W3, W4 …everything that writes tests, practically);
W6 → W7; W4 → W9 (shared bracketing semantics); W3/W4 → W8 (the idiom needs the
primitives it teaches). W5 is independent.

---

## 1 — Work items

### W1 — Wire test-declared inputs into the test run (G6, build, S)

**Problem.** `testrunner.ts` implements `substituteInputs` — a test's declared
inputs substitute for the subject's same-named inputs, unknown names fail — but
`AsyncEngine.runTests` builds one `SuiteContext` per *subject* with only
`#inputsFor(subject)`, and `engineWorker.runSuites` never calls
`substituteInputs`. A test can only see subject-live inputs; the holdout pattern
(ARCHITECTURE_PLAN §3.1's first example) and fixture-fed oracles are
unwritable. Receipt: the Caldera oracle had to be inlined as constants
(`checks.sheet.js` GAP note).

**Approach.**
- Host side: resolve each test's declared input paths (externals + published
  results — the same resolution machinery `#inputsFor` uses, lifted to operate
  on a test's `InputSpec`s). Unresolvable reference ⇒ that test's outcome is a
  *failing* record with the message, never a silent `null` (mirrors
  `TestRunContext.error`).
- Protocol: `SuiteContext` gains per-test inputs (e.g. `tests:
  {id, inputs}[]`) — an internal host↔worker shape change, no document-format
  impact.
- Worker side: for each test, `substituteInputs(testInputs, subjectInputs)`
  then `runTest` with the substituted set; `reevaluate` for invariance
  relations applies transforms to the substituted inputs (so a holdout test +
  a metamorphic relation compose).

**Exit gates.**
1. A **holdout test** in Caldera: subject `model.operating`, inputs substituting
   `plan` with a `fixtures.ops_plan_holdout` variant (a genuinely different
   plan), asserting oracle values generated for that variant — passes through
   the real `AsyncEngine.runTests`.
2. The **oracle test** rewritten to read `fixtures.expected_values` through
   test inputs; the inlined constants in `checks.sheet.js` deleted.
3. A test declaring a name the subject does not declare fails with
   `substituteInputs`' message (unit test in `testrunner.test.ts`).
4. Verdict surface (`suiteReport.ts`, `useVerdicts`) unchanged — this is
   invisible plumbing below it.

### W2 — Tolerant invariance comparisons (G7, build, S)

**Problem.** `permutationInvariance` compares via strict `deepEqual`; row
reordering reorders float summation, which can differ in the last ulp (benign
in Caldera's values — by luck). `scaleInvariance` scales *every* numeric leaf,
so any input carrying rates/percentages (margins, growth) breaks it — i.e. most
financial inputs, permanently.

**Approach.**
- Both relations accept an optional `tol` (default a tiny relative tolerance,
  e.g. `{rel: 1e-12}`) and compare numeric leaves with `expectClose` semantics,
  structure strictly. A dated note in `relations.ts` records this as a bugfix
  to a mis-designed comparison — behavior change inside additive-only, which
  the spec permits for *corrections* but requires recording.
- `scaleInvariance` gains `leaves?: string[]` (or `except: string[]`) naming
  which fields participate in scaling; default stays all-leaves for
  backward compatibility.

**Exit gates.** An adversarial unit test: rows whose reordered sum differs by
1 ulp passes `permutationInvariance` and would have failed `deepEqual`; a
`scaleInvariance({leaves: ['fy2026']})` test over a rate-bearing fixture;
all Caldera invariance tests stay green without modification.

### W3 — `rollforward` + `cumprod` stdlib primitives (G5, build, M)

**Problem.** The debt schedule — co-evolving balances, one year feeding the
next — is THE most repeated structure in financial modeling (debt, NWC, PP&E,
CAGR bridges). The ordered family (`cumsum`/`cummax`/`cummin`/`ema`) is
single-state; Caldera needed a custom packed-state `ScanOp` + `derive`-unpack —
expressible but undiscoverable, precisely the "hand-rolled loop the design
exists to prevent" (ADVERSARIAL_REVIEW_1 DSL-1). `cumprod` (growth paths) is
missing for the same reason.

**API sketch** (spec-by-example: the Caldera debt schedule):

```js
rollforward(ops, {
  orderBy: "year",                      // required — window semantics need order (scan's lesson)
  begin: { rev: 0, tlb: su.tlb0, mezz: su.mezz0, cash: a.min_cash },
  step: (row, bal) => {
    // …the waterfall…
    return { out: { interest, cfadr, mand, sweep, /* … */ },
             next: { rev, tlb, mezz, cash } };
  },
})
// → ops rows ∪ out columns ∪ next-as-end columns; `next` is the begin of the following row.
```

Decisions to make at implementation: output shape (flatten `out.*` and
`next.*`, vs nested like the packed-scan workaround — flatten, it killed the
unpack step); whether `begin` may reference the first row; null semantics (a
`next` containing NaN/Infinity ⇒ `null` per DSL-6, not silent poison); the
self-description text steering authors away from `scan` for multi-state folds.

**Exit gates.**
1. `rollforward.test.ts` unit suite incl. empty-rows, one-row, and
   NaN-in-state cases.
2. **Port-forward:** `model.sheet.js`'s `scheduleYears` and the growth-path
   `scan` rewritten on `rollforward`/`cumprod`; the case study stays green
   against the Python oracle untouched — *the specification tests are the
   refactor safety net, which is the quiet argument for tested formulas.*
3. Catalog self-descriptions with 1–2 worked examples (RQ-A5), and the
   catalog gate test extended.

### W4 — Financial function family: `irr`, `npv`, `xirr` (G2, build, S–M)

**Problem.** No financial callables; every finance user re-derives IRR by
hand (Caldera: a 15-line bisection, exact to 1e-12 — good code that nobody
should have to write twice).

**Approach.** Minimal set first: `irr(flows, opts?)` (bracketed bisection —
deterministic, no Newton convergence surprises; documents the single-sign-change
assumption and *throws visibly* on unbracketed flows rather than returning
garbage), `npv(rate, flows)`, `xirr(dated rows, {by: 'date'})` (the one real
design question: date parsing rides the pure `dates.ts` helpers). `pmt`/`rate`
deferred until a case study needs them (additive-only means additions are
always possible; the *ceiling* is the cost, see risk).

**Risk.** RQ-A5's ~20-callable ceiling is already strained; this plan adds
`rollforward`, `cumprod`, `fixpoint`, `solve`, `irr`, `npv`, `xirr`. The
defense is the same as the review-1 window-family additions: each replaces a
hand-rolled loop class, it does not add surface for its own sake. Record the
ceiling re-count in the W3/W4 PR descriptions.

**Exit gates.** Caldera `returns`/`returns_avg`/`breakeven` cells use `irr`;
parity test: `irr` vs the hand-rolled bisection over the 25-cell grid to 1e-15;
catalog entries; the hand-rolled helpers deleted from `model.sheet.js`.

### W5 — Assumptions-as-params (G9, build, M)

**Problem.** The analyst's core loop — change any assumption, watch
everything recalc — only works for the three declared manifest params. The tax
rate or sweep percentage cannot be what-iffed without editing a fixture, and
nothing tells the reader which leaves *could* be knobs. The biggest
daily-friction gap.

**Approach.** Explicit, validated, opt-in: `reckoner.json` gains

```jsonc
"paramRefs": {
  "tax_rate":        { "from": "fixtures.assumptions", "path": "0.tax_rate" },
  "cash_sweep_pct":  { "from": "fixtures.assumptions", "path": "0.cash_sweep_pct" }
}
```

- `parseManifest` validates shape (additive optional key — format stays 1);
  resolution happens in the loader/app: the param's *default* is read from the
  referenced leaf; a runtime write *shadows* the leaf for cells that declared
  the fixture input, reusing the existing externals/update path — no engine
  change, the dependency graph already tracks the fixture input.
- Shadowing rule to decide: replace the leaf inside the injected fixture value
  (structural sharing), so formulas see one coherent frozen snapshot — never a
  second ambient channel.
- xref: `paramRefs` keys count as params for `validateExternalReferences`;
  unknown `from`/`path` ⇒ load diagnostic, not silent.
- UI: the params surface lists them with their fixture provenance; templates
  may bind `Value source="params.tax_rate"` or a `Range` with declared bounds.

**Exit gates.** In the running app over the Caldera document: flip
`params.tax_rate` 25%→30%, only the dependents of `fixtures.assumptions`
recompute (assert via pass results), IRR visibly moves, the schedule rows
match a Python truth variant generated for 30%; a broken `paramRefs` entry
produces a load diagnostic.

### W6 — stdlib `fixpoint` helper (G1a, build, S)

**Problem.** Convergent (circular) calculations are expressible today only as
a hand-rolled loop inside a formula — correct but undocumented convention,
with no standard place for iteration counts and convergence evidence.

**Approach.** Formalize the pattern, change nothing about the graph:

```js
fixpoint(initial, step, { tol = 1e-12, maxIterations = 200 })
// → { converged, iterations, value } — `converged: false` is the VALUE's
//   responsibility to surface (or a visible error), never silent.
```

Pure, additive, self-described. (This is the Caldera avg-balance loop lifted
verbatim.)

**Exit gates.** `debt_schedule_avg` uses `fixpoint`; the convergence property
test now asserts on the returned `iterations`/`converged` record; unit tests
for non-convergence (oscillating step ⇒ `converged: false`).

### W7 — Converged-cell design spike → spec (G1b, design, M)

**Problem.** Whether convergence deserves to be a *cell kind* (first-class:
iteration counts on the trace channel, non-convergence a lattice error,
per-cell budget against the watchdog) or stays a helper (W6) is an open design
question with real information-flow consequences.

**Approach.** Design sprint, not implementation: draft the spec covering —
the cell-kind API vs helper-only; where iteration counts + residuals flow
(ENGINE_INFORMATION_FLOW_SPEC: another `(epoch, tier)`-tagged channel); the
failure story (exceed `maxIterations` ⇒ visible error on the cell — Excel's
silent-iterative-calc failure class, structurally impossible here); versioning
(a new constructor is a stdlib addition; documents using it bump their derived
`compat.stdlib` floor automatically per DOCUMENT_VERSIONING_SPEC §3).
**Gate:** go/no-go with the named criterion — implement the cell kind only if
a real document needs convergence *diagnostics* (iteration counts surfaced in
the review surface, budget accounting), not merely convergence. If W6 has
covered every need by then, close this item as `helper-only, recorded`.

> **Outcome (2026-08-27, R3-379): helper-only, recorded** — the decision, the
> pinned idiom, and the three behavioral reopening criteria live in
> [`specs/CONVERGENCE_SPEC.md`](specs/CONVERGENCE_SPEC.md) §4–§6, with the
> adversarial self-review of that decision in §6.

### W8 — Sweep construct: measure-first (G4, measure, S)

**Problem.** Excel's data table is 2 minutes; Reckoner's sensitivity is a
model-as-function decomposition tax. Before building an engine-level
parametric-cell construct, measure whether the *assistant idiom* already
closes the gap.

**Approach.**
1. Extend `docs/assistant/FORMULA_AUTHORING_PROMPT.md` with the
   model-as-function + `runModel` + sweep idiom (post-W3/W4, so the taught
   primitives exist), including the anti-pattern note ("don't re-derive inputs
   inside the sweep; pass the declared inputs through").
2. Bake-off in the E-1 style: N agent attempts to author the Caldera
   sensitivity cell from self-descriptions alone, scored on first-attempt
   correctness + diff auditability.

**Gate.** If the idiom authors reliably (the bar E-1 set for the DSL), the
engine-level construct is *rejected as unnecessary* and recorded here; if not,
the failure modes name the requirements for a `sweep()` design spike. Either
way the decision is measured, not vibes.

### W9 — `solve` (G3, build, S)

1-D monotone goal seek as a pure helper sharing `irr`'s bracketing semantics
(`solve(fn, target, lo, hi)`); exit gate: `breakeven_exit_multiple` uses it,
parity vs the hand-rolled bisection. Interactive/multi-variate Solver stays a
non-goal (§5).

### W10 — Display formats for finance (G8, build, S)

`format` enum additions (`multiple`), a units/suffix attribute on `Kpi`/`Table`
columns (e.g. `unit="EUR m"`, accounting negatives), riding the catalog-version
bump per DOCUMENT_VERSIONING_SPEC §3.3. Display-only; anti-affordance review is
a formality. Exit: the deal summary renders 2.75x, EUR m, and parenthesized
negatives without bespoke formatting cells.

---

## 2 — Milestones

| Milestone | Items | Gate |
|---|---|---|
| **M0 — unblock testing** | W1, W2 | the holdout + oracle + adversarial-float tests pass through the real engine; verdict surface unchanged |
| **M1 — finance stdlib** | W3, W4 | Caldera port-forwarded onto `rollforward`/`cumprod`/`irr` with the Python oracle as the only truth; catalog gate extended; ceiling re-count recorded |
| **M2 — liveness + convergence** | W5, W6 | live `tax_rate` knob in the app; `fixpoint` carries the avg-balance schedule |
| **M3 — designs & measures** | W7, W8 | converged-cell go/no-go recorded; sweep-construct decision measured |
| **M4 — polish** | W9, W10 | goal seek on `solve`; finance-grade rendering |

M0 first and small; M1 is the additive-only-clock item (primitives land early
or become permanent scars); M2 makes the analyst loop real; M3 spends design
only where M2's cheap versions might already suffice; M4 is tail.

---

## 3 — Decisions & rejected alternatives

- **W1 before everything.** A wiring bug against the plan's own spec'd
  example, and every later item writes tests through the path it fixes.
  *Rejected:* rolling it into W3 — it would blur a bugfix with a primitive.
- **`rollforward` as a primitive, not a `scan` tutorial.** The case study
  proves the packed-`ScanOp` escape hatch works; discoverability, not
  expressibility, is the gap. *Rejected:* documenting the scan idiom only
  (same class of answer as "you can hand-roll IRR").
- **Financial family minimal set (`irr`/`npv`/`xirr`).** Additive-only cuts
  both ways; `pmt`/`rate` wait for a needing case study. *Rejected:* the full
  Excel financial family up front.
- **`paramRefs` explicit over conventions.** An "assumptions fixture
  auto-exposes every leaf" convention is zero-config but implicit — the
  grid's untyped-values sin in new clothes. Explicit refs are diffable,
  validatable, and degradable (a broken ref is a diagnostic).
  *Rejected:* the convention; also *rejected:* params editable without
  declaration (destroys the dependency story params exist for).
- **`fixpoint` helper before any converged-cell kind.** Ship the cheap,
  additive formalization; design the cell kind only against a demonstrated
  need for *diagnostics*, with the go/no-go criterion named in W7.
  *Rejected:* jumping to the cell kind (engine + spec + versioning cost
  before the need is shown).
- **Sweep: measure before building.** W8's bake-off decides; the construct is
  the fallback, not the default. *Rejected:* designing parametric cells on
  the assumption agents can't author the idiom.

## 4 — Non-goals (v1 of this plan)

Multi-variate Solver; VBA/macros (never — the security model's point);
Excel-style free-form layout authoring; pivot tables (reshape covers it);
live-feed ingestion changes (the LBO corpus is static by design — Meridian
already covers the streaming half).

## 5 — The case study as standing acceptance corpus

Each primitive item (W3, W4, W6, W9) lands **together with its Caldera
port-forward**, and the Python oracle — regenerated by `generate.py`, asserted
by `calderaCaseStudy.test.ts` — is the only truth either side touches. This is
the pattern the Meridian study set and the reason these refactors are cheap:
the specification tests exist *before* the refactor, which is the hypothesis's
proof turning into the hypothesis's dividend.
