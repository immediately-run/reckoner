# Caldera Components — LBO case study

The financial-domain sibling of the Meridian study: a complete leveraged-buyout
model, ported from a real-shape Excel workbook to a Reckoner document, with
Python-verified truth. Commissioned to find the gaps between what Reckoner can
currently do and what finance people use Excel for — the full findings live in
[`../../LBO_CASE_STUDY_GAP_ANALYSIS.md`](../../LBO_CASE_STUDY_GAP_ANALYSIS.md).

**Target:** Caldera Components Ltd (fictional mid-market industrial components
maker). **Sponsor:** Harrow Capital (fictional). Close 2026-12-31, five-year hold
(FY2027–FY2031). Structurally the canonical public LBO template (Macabacus,
"LBO model — short form": assumptions → sources & uses → operating model → debt
schedule → returns → sensitivity; see
<https://macabacus.com/valuation/lbo-overview>).

Everything is computed in Python (`generate.py`, deterministic, no RNG) so the
numbers are real and verified: sources equal uses to float precision, the debt
roll-forward conserves, the circular average-balance interest variant is
converged to a fixed point, and the 25-cell sensitivity grid is 25 full model
re-runs. The Reckoner port matches this truth to 1e-6 on every schedule row and
to 1e-10 on IRR (proven by `src/document/calderaCaseStudy.test.ts`).

## Files

| File | What it is |
|---|---|
| `generate.py` | truth generator: model in Python, writes everything below |
| `xlsx_writer.py` | dependency-free .xlsx writer (live formulas, named ranges, iterative calc) |
| `caldera_lbo.xlsx` | the Excel "before": 8 sheets, 963 cells, **622 live formulas** — incl. MIN/MAX revolver logic, `IRR()`, a deliberately **circular average-balance sheet**, a hand-rolled two-way sensitivity engine, and an `IF(...,"OK","BREAK")` checks sheet |
| `expected.json` | full-detail truth (the vitest harness asserts against this) |
| `data/*.csv` | human-readable inputs: historicals, management plan, assumptions |
| `document/` | the Reckoner "after" — a real loadable document: `reckoner.json`, 2 worksheets (13 model cells + **22 test cells**), 5 fixtures, 1 template |
| `document/worksheets/model.sheet.js` | the model as pure functions: operating build (`join`/`scan`/`groupBy`/`lag`), sources & uses, debt schedule (multi-state packed `scan`), the circular variant as an explicit converged fixed point, bisection IRR, 25-run sensitivity grid, goal-seek breakeven |
| `document/worksheets/checks.sheet.js` | the Excel checks sheet, upgraded: specification (oracle), conservation, permutation-invariance, and property tests (covenants, monotonicity, convergence) with mandatory kinds |

## The deal (base case)

LTM EBITDA 46.27 → entry 8.0x = EV 370.16. Funding: 5.0x TLB (8.0%, 1%
mandatory amort, 75% cash sweep) + 1.0x mezzanine (12% cash / 2% PIK) + 2.0
balance-sheet cash + **sponsor equity 114.88** (the plug; sources = uses to
5.7e-14). Exit FY2031 at 8.0x EBITDA 64.61 → **exit equity 315.46, MOIC
2.75x, IRR 22.39%** (average-balance interest variant: 22.52%). Breakeven exit
multiple for the 20% hurdle: **7.54x**. Covenants hold all years (worst
leverage 5.31x vs 6.0x max; worst coverage 2.06x vs 2.0x min).

## Planted probes (what the port had to survive)

1. **Circularity** — average-balance interest (Excel's iterative-calc sheet)
   vs Reckoner's rejected cycles: ported as an explicit per-year fixed point
   inside one cell, converged to 1e-12, with a property test proving
   convergence. The gap report's headline finding.
2. **Goal seek** — breakeven exit multiple: bisection over the model-as-a-function.
3. **Two-way sensitivity** — Excel data table / hidden engine sheet vs
   `runModel()` mapped over 25 parameter pairs (forces model-as-function
   decomposition).
4. **Multi-state roll-forward** — the debt schedule is THE canonical financial
   structure; the stdlib has no rollforward primitive (cumsum is single-state),
   so the port uses a custom packed `scan` op.
5. **Rate-bearing inputs** — `scaleInvariance` scales every numeric leaf
   (including margins/growth), making it unusable on financial inputs;
   permutation invariance + property tests carry the metamorphic leg instead.
6. **The oracle gap** — test-declared fixture inputs never reach the test
   context (test-runner wiring), so the Python oracle is inlined as constants.

## Running

```bash
python3 generate.py                       # regenerate truth + xlsx (deterministic)
cd ../../.. && npx vitest run src/document/calderaCaseStudy.test.ts
```

The vitest harness loads `document/` through the real `loadDocument` loader,
runs it in the real SES-compartment engine, asserts every schedule year, the
returns, the 25 grid cells, and the 22 workbook tests against `expected.json`,
and asserts the load-bearing cells earn a `validated` verdict (a metamorphic or
property leg — not merely pinned to examples).
