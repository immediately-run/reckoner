# LBO case study — Reckoner vs Excel gap analysis

**Status:** findings report · **Updated:** 2026-08-27
**Artifact:** [`case-study/caldera/`](./case-study/caldera/) · **Proof:** `src/document/calderaCaseStudy.test.ts` (4 tests, green; full suite 363 green, lint + build clean)

The question this study was commissioned to answer: *what gaps exist between
what Reckoner is currently capable of and what finance people use Excel for —
and is there evidence for the hypothesis that tested formulas + named values
beat a grid of untyped values?*

Method: take the canonical complex financial spreadsheet — a leveraged buyout
model (structure per Macabacus's public LBO template: assumptions → sources &
uses → operating model → debt schedule → returns → two-way sensitivity) — build
it **twice**: as a real Excel workbook (`caldera_lbo.xlsx`, 8 sheets, 963
cells, 622 live formulas, named ranges, an iterative-calc circular sheet, a
hand-rolled sensitivity engine, a checks sheet) and as a Reckoner document (2
worksheets, 13 model cells, 22 test cells, 1 template), both verified against
an independent Python implementation of the model. Every number in the Reckoner
port matches the Python truth: schedule rows to 1e-6, IRR to 1e-10, the
sensitivity grid's center to exact float equality.

---

## 1 — The headline scoreboard

| Excel feature the model uses | Reckoner disposition | Verdict |
|---|---|---|
| Named ranges (`entry_multiple` → `Assumptions!$C$4`) | Names are mandatory: `params.entry_multiple`, `model.debt_schedule`, cell `doc` strings required by `cell()` | **Better** — intent-carrying names by construction, not opt-in discipline |
| Years-across-columns, fill-right | Rows-per-year + `orderBy` + `scan`/`lag`; dependency-correct by construction | **Equivalent** — different orientation, no fill-handle foot-gun |
| `SUM`/`SUMPRODUCT`/`MIN`/`MAX`/`IF` | `rollup`/`sum` + plain JS `Math.min`/`max`/conditionals in formulas | **Equivalent** |
| `INDEX`/`MATCH` lookups | `join`/`asofJoin` | **Equivalent** (barely needed in an LBO) |
| `IRR()` over a flows row | **Gap** — no financial functions; hand-rolled bisection (~15 lines, exact to 1e-12, unit-testable) | **Gap G2** |
| Circular refs + iterative calc (avg-balance interest) | Cycles rejected by the scheduler; ported as an explicit intra-cell fixed point, converged + property-tested | **Gap G1** — expressible, architectural tax; see §3 |
| What-If **data tables** (two-way sensitivity) | No construct; requires the model decomposed as a pure function, then `map` over parameter pairs (25 full re-runs) | **Gap G4** — more rigorous, higher up-front cost |
| **Goal seek** (breakeven exit multiple) | No interactive solver; 1-D monotone goal seek = bisection over the model-as-function (proven) | **Gap G3** |
| Checks column `IF(...,"OK","BREAK")` | Typed test cells with mandatory kinds + review-surface verdicts (`validated`/`pinned`/`untested`) | **Categorically better** — see §4 |
| Multi-sheet model organization | Worksheets as namespaces; every cross-reference a dotted name | **Equivalent-to-better** |
| Scenario manager | `params.*` + manifest defaults + widget writes | **Equivalent** (needs more, see G9) |

---

## 2 — Gaps, in priority order

### G1 — Circularity / iterative calculation (the big one, conceptually)

Real LBO models charge interest on *average* balances, which is circular
(interest → cash flow → sweep → ending balance → interest). Excel's answer is
iterative-calc mode: circular references silently converge, or silently blow up
to zero / oscillate — a famous silent-error class that audit tooling exists
specifically to catch.

Reckoner's scheduler **rejects cycles outright** (engine `cycles.test.ts`), so
the port had two options and exercised both:

- *Avoid* (the common simple-model convention): interest on beginning balances —
  `model.debt_schedule`.
- *Make explicit*: `model.debt_schedule_avg` charges interest on average
  balances via a per-year fixed-point loop **inside one cell's formula**,
  converged to 1e-12 (~8 iterations/year), with a property test asserting
  convergence and an independent-oracle test on the answer (IRR 22.515% vs
  Python's independently-converged 22.515%).

**Finding:** circularity is *expressible* today but only through a convention
(inside-one-formula fixed points). The roadmap-shaped fix is a first-class
**converged/fixed-point cell kind** — declare the state, the transition, the
convergence tolerance; the engine iterates, reports iteration counts and
non-convergence as a *visible* failure instead of Excel's silent one. The
honest counter-point: Excel's version is dangerous precisely because it is
invisible; Reckoner's explicit version is testable — the gap is ergonomic, not
correctness.

### G2 — No financial function library

`irr` had to be hand-rolled (bisection; safe here because the flows have one
sign change, so NPV(r) is monotone). The same is true of NPV, XIRR, PMT, RATE,
etc. — the entire Excel financial family. The hand-rolled version is arguably
*better* (exact, pure, testable, no Newton-method convergence surprises), but
every finance user re-derives it. **Recommendation:** decide the financial
family early — the stdlib's additive-only freeze (ARCHITECTURE_PLAN §3.2) makes
a missing family permanent until added, which is cheap now and expensive later.

### G3 — Goal seek / Solver

Excel's interactive goal seek ("set IRR to 20% by changing exit multiple") has
no Reckoner analogue. The port's `model.breakeven_exit_multiple` proves the 1-D
monotone case is a 10-line bisection over the model-as-function. Multi-variate
Solver-style optimization (e.g., optimal capital structure) is a genuine gap
with no clean workaround. Note the precondition both share: **the model must
already be a pure function** (see G4).

### G4 — Data tables force the model-as-function decomposition

Excel's two-way data table is 2 minutes of clicking and re-runs one output over
a hidden parameter space. Reckoner has no such construct; the sensitivity grid
is `runModel(a, hist, plan, yearPlan, {exit_multiple, tlb_turns})` mapped over
25 pairs — 25 *full, independent* model re-runs as a first-class value you can
test (the monotonicity property test does).

This exposed the deepest structural difference in the port: because a Reckoner
cell cannot re-run other cells (no ambient registry — by design, RQ-A2), any
parameter sweep requires the model decomposed into callable pure functions
first. That is an up-front architectural tax Excel never charges — and it pays
back as: arbitrary sweep dimensions (Excel caps at 2), composable sweeps
(sweep the sweeps), testable sweeps, and no volatile-function recalc breakage.
The Excel "before" needed a dedicated hidden 296-cell engine sheet to fake
this; the Reckoner version is one cell.

### G5 — No multi-state roll-forward primitive (the stdlib's biggest finance miss)

The debt schedule — beginning balances, interest, mandatory amort, cash sweep,
ending balances, one year feeding the next — is THE most repeated structure in
financial modeling (debt schedules, NWC schedules, PP&E roll-forwards, CAGR
bridges). The stdlib's ordered family (`cumsum`, `cummax`, `cummin`, `ema`,
`lag`) is single-state; a debt schedule needs a **tuple of co-evolving
balances**. The port used a custom packed-state `ScanOp` (returns the whole
state object per row, `derive` unpacks the columns) — expressible, but the
exact "hand-rolled loop the design exists to prevent" (ADVERSARIAL_REVIEW_1
DSL-1's phrase) in thin disguise. Also missing: `cumprod` (growth paths).

**Recommendation:** a `rollforward` primitive — declare begin-state columns, a
transition function, produce end-state + unpacked per-row columns. This case
study is the spec-by-example for it.

### G6 — Test-declared inputs never reach the test context (bug-level)

`testrunner.ts` implements `substituteInputs` — a test's declared inputs
substitute for the subject's same-named inputs (the holdout pattern;
ARCHITECTURE_PLAN §3.1's own first example) — but the M2 wiring
(`AsyncEngine.runTests` → `engineWorker.runSuites`) resolves only the
**subject's** live inputs. A test declaring `expected: "fixtures.expected_values"`
gets nothing (and a same-named-but-unknown input should fail substitution).
Consequence in this port: the Python oracle had to be **inlined as constants**
in `checks.sheet.js` instead of read from a fixture. Same-shaped holdout tests
(fixture-swaps for the data input) would also fail to see their fixture.
**Recommendation:** wire `substituteInputs` into `runSuites` — resolve test
inputs against externals + published results, reject names the subject does
not declare.

### G7 — Invariance relations are float-fragile

`permutationInvariance` compares via strict `deepEqual`; reordering rows
reorders float summation, which can differ in the last ulp (it happened not to,
with this dataset's benign values — verified green, but by luck). A relation
whose honest purpose is "order doesn't matter" should tolerance-compare numeric
leaves. Same class: `scaleInvariance` scales *every* numeric leaf — unusable on
any input carrying rates/percentages (margins double too), i.e., unusable on
most financial inputs. **Recommendation:** numeric-tolerant deep comparison for
invariance relations; consider a `linearLeaves` option naming which fields
scale.

### G8 — Number presentation for finance audiences

Units (EUR m), percent formats, multiple suffixes ("2.75x"), accounting
negatives in parentheses, thousands separators: `Kpi` has a fixed
format enum (number/currency/percent); no custom units/suffix. Cosmetic but
every finance reader notices on first contact.

### G9 — What-if ergonomics: only declared params are live

The analyst's core loop in Excel: click any assumption, type a new value,
watch everything recalc, undo. In the port, exactly three knobs are live
(`entry_multiple`, `exit_multiple`, `tlb_turns` — manifest `params` + Range
widgets, which work beautifully and are *dependency-traced*). But the tax rate,
sweep percentage, or mezzanine pricing cannot be what-iffed without editing a
fixture — the analyst cannot even see which assumptions *could* be knobs.
**Recommendation:** a document-level affordance to expose any fixture leaf as a
param (or an "assumptions are params" convention), so the whole assumption
surface is live by default. This is the biggest *daily-friction* gap — bigger
than G1, which is rare-but-deep where this is shallow-but-constant.

### Notably NOT gaps

- **Pivot tables** — reshape via `groupBy`/`rollup`/`pivot`; not needed here.
- **Scenario manager** — params + literal option sets cover it.
- **Auditing toolbar / trace arrows** — Reckoner's precedent view over named
  cells is structurally better than tracing `G44` through 622 formulas;
  younger, but the right shape.
- **VBA/macros** — out of scope by design (and the security model's whole
  point).
- **Big data** — LBO models are small-data/heavy-logic; feeds/streaming are
  Reckoner advantages Excel cannot touch, unexercised here by design.

---

## 3 — The hypothesis: tested formulas + named values vs a grid of untyped values

Evidence **for**, from this port:

1. **Names carry intent; the grid carries coordinates.** Every reference in
   the port is `model.debt_schedule`, `checks.sched_covenants`,
   `params.exit_multiple` — and `cell()` *refuses to register* a cell without
   a one-line intent doc ("specific enough that another agent could write
   tests from it alone", `stdlib/cell.ts`). The Excel before communicates
   through `='Debt_Schedule'!G44` plus optional cell comments plus tribal
   knowledge. Named ranges exist in Excel and went unused by convention —
   optional discipline loses to mandatory structure.

2. **The checks sheet vs the test suite is not a fair fight.** The Excel
   workbook's `Checks` sheet holds 25 `IF(...,"OK","BREAK")` text cells that
   gate nothing, are read by no one, and can themselves reference the wrong
   cells. The port's 22 typed test cells check the *same* invariants (sources =
   uses, roll-forward conservation, covenants) **plus** ones the Excel model
   cannot express cheaply: the sensitivity surface is monotone in both
   directions, the breakeven sits on the correct side of the base case, the
   fixed point actually converged, segment order does not matter. And the
   verdict taxonomy is doing real work: cells with only oracle tests read
   `pinned` (regression evidence, not validation); the load-bearing cells read
   `validated` because a metamorphic/property leg exists. Excel has no
   analogue — a green Checks sheet certifies nothing.

3. **Independent verification was cheap because the model is a function.** The
   Python truth and the JS port reached *identical floats* (IRR
   0.22387462120837076; grid center exact-equal) through completely different
   decompositions (columnar unrolling vs functional scan). Cross-implementation
   agreement to the last bit is only available when the computation is pure and
   explicit — which the grid's side-effectful recalc culture actively resists.

4. **The dangerous features are the invisible ones.** Iterative calc (G1) and
   volatile data tables are where Excel models rot; the port's equivalents are
   explicit (a loop you can read, a grid you can test). Where Excel is better,
   it is almost always *faster to first number*, not *safer to wronger numbers*.

Evidence **against** (honest):

1. **Time-to-first-what-if.** Excel: open, type, recalc — zero ceremony. The
   port: params must be declared, fixtures authored, helpers factored. The
   model-as-function tax (G4) is real and up-front.
2. **Visual scanning.** A 5-year columnar model is genuinely readable as a
   grid; the eye traces columns. The port's tables are as readable, but the
   *authoring* surface (JS module) is not a visual object.
3. **Two-minute data tables.** Until Reckoner grows a sweep construct (or the
   assistant writes the `runModel` + `map` idiom instantly), Excel wins the
   quick sensitivity.
4. **Forty years of muscle memory** and an entire profession trained on the
   grid — a switching cost no feature list removes.

**Verdict:** the hypothesis survives contact with the canonical complex
financial model, with the strongest form being: *Reckoner's constraints convert
Excel's silent failure classes (invisible circularity, unreadable provenance,
checks-that-gate-nothing) into visible, testable structure — at the cost of
up-front decomposition and a missing stdlib/primitives layer (G1–G5, G9) that
is concrete, enumerable, and mostly additive.*

---

## 4 — Receipts

- Excel before: `caldera_lbo.xlsx` — 8 sheets, 963 cells, 622 formulas; the
  two-way sensitivity alone needed a hidden 296-cell engine sheet; the circular
  sheet requires iterative calc enabled; no test can live inside the file.
- Reckoner after: `document/` — 2 worksheets, 13 model cells, 22 test cells,
  41-line template; the same sensitivity is one cell; the same circularity is
  one converged cell; the oracle agreement is machine-checked.
- Proof: `npx vitest run src/document/calderaCaseStudy.test.ts` — loads the
  document through the real loader, runs it in the real SES-compartment engine,
  asserts all schedule years / returns / 25 grid cells against `expected.json`,
  runs all 22 workbook tests, and asserts `validated` verdicts for the ten
  load-bearing cells. Full repo suite: 363 tests green; `npm run lint` and
  `npm run build` clean.

## 5 — Recommended follow-ups (roadmap-shaped)

1. **G6** (wire `substituteInputs` into `runSuites`) — bug-level, small, unblocks
   the plan's own holdout-test pattern. Do first.
2. **G5** (`rollforward` + `cumprod` stdlib primitives) — spec-by-example is
   this case study; additive-only freeze argues for deciding early.
3. **G1** (converged fixed-point cell kind) — design spike; the explicit-loop
   convention works until then.
4. **G9** (assumptions-as-params affordance) — the daily-friction gap.
5. **G2** (financial functions family: `irr`/`npv`/`xirr` at minimum) —
   additive-only, so schedule deliberately.
6. **G4** (a sweep/sensitivity construct over model-functions) — or lean on the
   assistant authoring the idiom; measure which.
7. **G7** (tolerant invariance comparisons) — small, hardening.
