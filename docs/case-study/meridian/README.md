# Meridian SaaS — exec-metrics case study

The concrete artifact commissioned by design-brief 01 (`immediately-run/docs` →
`design-briefs/reckoner/01-benchmark-case-study.md`): a coherent, internally-consistent
synthetic B2B-SaaS reporting workbook used to **develop, validate, and demonstrate** Reckoner.
One artifact, three jobs — design anchor, formula/template stress test, and evaluation corpus.

**Everything here is generated** by [`generate.py`](generate.py) (deterministic, `seed=20260709`);
re-running reproduces byte-identical output. The numbers are computed in Python so they are
**real and verified** — in particular the MRR movement waterfall genuinely reconciles to the
MRR delta, so the `conservation()` metamorphic test is a true check, not a tautology.

## Files

| File | Sheet | Rows | What it is |
|---|---|---|---|
| `data/subscriptions.csv` | Subscriptions | 2,175 | one row per active customer-month: plan, seats, `mrr_local`, currency, region, signup month |
| `data/invoices.csv` | Invoices | 2,175 | one invoice per active customer-month, in the customer's currency |
| `data/fx.csv` | FX | 143 | monthly rate per currency (EUR base) — **with a deliberate gap: GBP 2024-02 is missing** |
| `data/targets.csv` | Targets | 36 | board MRR targets (base / bull / bear) + NRR target, per month |
| `data/mrr_movements.csv` | MRR movements | 36 | the waterfall: start → new / expansion / contraction / churned / reactivation → end, EUR |
| `data/cohort_retention.csv` | Cohort retention | 30 | signup-cohort × months-since retention % triangle (offsets 0–12) |
| `data/top_customers.csv` | Top customers | 11 | top-10 by ARR + an "Other" bucket, with concentration % |
| `data/exec_summary.csv` | Exec summary | 36 | MRR, MoM growth, NRR, GRR, quick ratio, gross churn, vs-target — per month |
| `meridian.xlsx` | (all 8) | — | the real Excel "before": all sheets + a **live** `recon_formula` column on MRR movements |
| `expected.json` | — | — | spot-check expected values that seed Reckoner `specification` tests |

Scope: 150 customers over 36 months (2023-07 … 2026-06). The subscription table is ~2.2k rows
(150 customers × their active lifetimes), smaller than the brief's illustrative "~5k" but with
the full event mix (expansion, contraction, churn, reactivation) needed to exercise the logic.

## The formulas — Excel "before" → Reckoner "after"

The derived sheets are the port targets. Each is stated as the Excel logic and its intended
Reckoner formula, to drive the port and the language stress test.

- **MRR movements (sheet 5)** — per customer, this-month vs last-month state, EUR-normalized.
  Excel: `SUMIFS` batteries with sign conventions (the classic silent-error sheet). Reckoner:
  `lag`/`asofJoin` over the FX + a self-join current↔prior on `(customer, month)`; `new` =
  first-ever-seen this month, `reactivation` = seen-before-but-absent-last-month (a `min(month)`
  split), `churned` = present-last-absent-this (a **full/anti-join** — one of the review-1 DSL
  additions). **Invariant:** `start + new + expansion + contraction + churned + reactivation =
  end` → a `conservation()` test; the generator confirms it holds to `0.0`.
- **Cohort retention (sheet 6)** — `groupBy(signup_cohort, months_since) → count`, then
  `pivot`; retention % = each cell ÷ the cohort's offset-0 size. Reckoner: **normalize before
  pivot** (compute `cohort_size` via `groupBy`, `join` back, `derive pct`, then `pivot`) — the
  DSL-4 ordering hazard the case study is meant to catch.
- **Top customers (sheet 7)** — `topN(10)` by ARR + an "Other" bucket + concentration %.
  Exercises `topN` composition and tie/other-bucket semantics (DSL-7).
- **Exec summary (sheet 8)** — ratios over grouped frames: NRR, GRR, quick ratio, MoM growth,
  churn %, vs-target. Exercises empty-group / divide-by-zero semantics (`safe_div` in the
  generator; `safeDiv`/`coalesce` in Reckoner — the DSL-6 null-semantics additions).

## Planted probes (primary outputs of the port, not footnotes)

Per brief 01 + the DSL adversarial review, the case study deliberately plants:

1. **FX gap** — GBP has no 2024-02 rate → the port must use `asofJoin` (carry-forward last
   known), not an equi-join (which would NaN-poison the EUR figures). `expected.json.fx_gap`
   records the gap and the carry-forward source.
2. **Conservation invariant** — the waterfall reconciles to `0.0`
   (`expected.json.waterfall_max_abs_recon_delta`), so `conservation()` is a real test.
3. **Ordered/relational logic** — month-over-month movement + running retention are exactly the
   ordered-across-rows operations the review-1 stdlib additions (`lag`/`scan`/`asofJoin`) exist
   for; if any needs a hand-rolled `.reduce`, that is a freeze-blocking DSL finding.
4. **Catalog gaps** — the exec-summary deck wants a **retention heatmap** (no v1 component), an
   **MRR waterfall** (no first-class component), and **growth-vs-target** (dual-axis, excluded).
   The port records a disposition for each (shade a `Table` / `Facets` / propose an
   anti-affordance-reviewed addition), not a silent omission.
5. **Empty/boundary groups** — early cohorts and calm months exercise empty-group and ÷0
   returns (`null`, not `0`/`NaN`) — the DSL-6 semantics.

## Regenerating / tuning

```bash
python3 generate.py     # writes data/*.csv, meridian.xlsx, expected.json
```

Change `SEED` for a different-but-coherent dataset; `N_CUST` / lifetimes to resize. The
reconciliation, the FX gap, and the cohort structure hold across seeds — they are structural,
not seed-specific.

## Provenance

Design-brief: `immediately-run/docs` → `design-briefs/reckoner/01-benchmark-case-study.md`.
The DSL additions this stresses: `docs/specs/DOCUMENT_VERSIONING_SPEC.md` neighbours +
`ARCHITECTURE_PLAN.md` §3.2 (the committed stdlib incl. the review-1 window/as-of/date/null
families) and `ADVERSARIAL_REVIEW_1.md` (DSL findings).
