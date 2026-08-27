#!/usr/bin/env python3
"""
Caldera Components — LBO case study generator.

The financial-domain sibling of the Meridian case study: a leveraged-buyout model
(structurally the canonical public LBO template — Macabacus "LBO model (short form)",
https://macabacus.com/valuation/lbo-overview: operating assumptions -> sources & uses ->
debt schedule (revolver + term loan B + mezzanine, cash sweep) -> exit returns (IRR/MOIC)
-> two-way sensitivity on exit multiple x leverage).

Everything is computed here in Python so the numbers are REAL AND VERIFIED:
  - the debt-schedule roll-forward genuinely conserves (begin - mandatory - sweep = end),
  - sources equal uses to the cent,
  - the sensitivity grid is 25 full model re-runs, and
  - the average-balance (circular) interest variant is converged to a fixed point.

Emits:
  data/*.csv                     human-readable inputs (historicals, plan, assumptions)
  document/fixtures/*.frame.json the Reckoner document's frozen frames (incl. the
                                 expected-values oracle used by specification tests)
  expected.json                  full-detail truth for the vitest harness + gap report
  caldera_lbo.xlsx               the Excel "before": live formulas, named ranges, an
                                 iterative-calc circular sheet, and a hand-rolled
                                 two-way sensitivity grid

Deterministic: no RNG at all (the plan IS the data). Re-running yields identical output.

Usage: python3 generate.py
"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
DOC = os.path.join(HERE, "document")
os.makedirs(DATA, exist_ok=True)

# ── the deal ──────────────────────────────────────────────────────────────────
# Target: Caldera Components Ltd — fictional mid-market industrial components maker.
# Sponsor: Harrow Capital (fictional). Close 2026-12-31. Hold 5 years (FY2027–FY2031).

YEARS = [2027, 2028, 2029, 2030, 2031]
SEGMENTS = ["seals", "bearings", "fabrication"]

# Historical segment revenue (EUR m), FY2024–FY2026. FY2026 = LTM at close.
HIST = [
    {"segment": "seals",       "fy2024": 86.2, "fy2025": 91.0, "fy2026": 96.0, "margin_fy2026": 0.260},
    {"segment": "bearings",    "fy2024": 70.1, "fy2025": 72.1, "fy2026": 74.0, "margin_fy2026": 0.190},
    {"segment": "fabrication", "fy2024": 60.5, "fy2025": 59.2, "fy2026": 58.0, "margin_fy2026": 0.125},
]

# Management plan: per segment x year revenue growth and EBITDA margin (margin expansion).
PLAN = {
    ("seals", 2027):       {"growth": 0.080, "margin": 0.264},
    ("seals", 2028):       {"growth": 0.080, "margin": 0.268},
    ("seals", 2029):       {"growth": 0.070, "margin": 0.272},
    ("seals", 2030):       {"growth": 0.070, "margin": 0.276},
    ("seals", 2031):       {"growth": 0.060, "margin": 0.280},
    ("bearings", 2027):    {"growth": 0.040, "margin": 0.192},
    ("bearings", 2028):    {"growth": 0.040, "margin": 0.194},
    ("bearings", 2029):    {"growth": 0.040, "margin": 0.196},
    ("bearings", 2030):    {"growth": 0.035, "margin": 0.198},
    ("bearings", 2031):    {"growth": 0.035, "margin": 0.200},
    ("fabrication", 2027): {"growth": 0.025, "margin": 0.127},
    ("fabrication", 2028): {"growth": 0.025, "margin": 0.129},
    ("fabrication", 2029): {"growth": 0.020, "margin": 0.131},
    ("fabrication", 2030): {"growth": 0.020, "margin": 0.133},
    ("fabrication", 2031): {"growth": 0.020, "margin": 0.135},
}

# Whole-company plan vectors by year.
YEAR_PLAN = [
    {"year": 2027, "capex_pct": 0.055},
    {"year": 2028, "capex_pct": 0.050},
    {"year": 2029, "capex_pct": 0.045},
    {"year": 2030, "capex_pct": 0.040},
    {"year": 2031, "capex_pct": 0.040},
]

# The holdout (downside) plan — R3-373's substitution fixture: growth 2pp lower and
# margins 0.5pp lower than management's plan, per segment-year. Used by the
# `ops_holdout` test to prove a test's declared inputs substitute for the subject's.
HOLDOUT_DELTA_GROWTH = -0.020
HOLDOUT_DELTA_MARGIN = -0.005
HOLDOUT_PLAN = {
    (s, y): {"growth": p["growth"] + HOLDOUT_DELTA_GROWTH, "margin": p["margin"] + HOLDOUT_DELTA_MARGIN}
    for (s, y), p in PLAN.items()
}

A = {
    "entry_multiple": 8.0,      # EV / LTM EBITDA paid at close
    "exit_multiple": 8.0,       # EV / EBITDA assumed at exit (no multiple expansion)
    "hold_years": 5,
    "tlb_turns": 5.0,           # Term Loan B at close, x LTM EBITDA
    "mezz_turns": 1.0,          # mezzanine at close, x LTM EBITDA
    "revolver_capacity": 25.0,
    "revolver_rate": 0.090,
    "commitment_fee": 0.005,    # on undrawn capacity
    "tlb_rate": 0.080,
    "tlb_amort_pct": 0.010,     # mandatory amortisation, % of original TLB p.a.
    "mezz_cash_rate": 0.120,
    "mezz_pik_rate": 0.020,     # PIK accrues: the mezz balance grows
    "cash_sweep_pct": 0.75,     # share of post-amort excess FCF that prepays the TLB
    "existing_debt": 55.0,
    "existing_cash": 10.0,
    "min_cash": 8.0,
    "txn_fee_pct": 0.020,       # advisory fees, % of EV
    "fin_fee_pct": 0.025,       # financing fees, % of funded debt
    "tax_rate": 0.25,
    "da_pct": 0.045,            # D&A, % of revenue
    "nwc_pct": 0.15,            # Δ NWC, % of the revenue increase
    "hurdle_irr": 0.20,         # the breakeven / goal-seek target
}

# Credit-agreement covenants (spec constants for the property tests).
COV_LEVERAGE_MAX = 6.0         # net debt / EBITDA
COV_COVERAGE_MIN = 2.0         # EBITDA / cash interest

# ── the model (mirrored operation-for-operation by the Reckoner port) ─────────


def ltm_ebitda():
    total = 0.0
    for h in HIST:
        total += h["fy2026"] * h["margin_fy2026"]
    return total


def build_operating(plan=None):
    """Segment revenue paths (chained growth), then per-year company rows."""
    plan = plan if plan is not None else PLAN
    seg_rows = []
    by_year = {y: {"revenue": 0.0, "ebitda": 0.0} for y in YEARS}
    prior_total = sum(h["fy2026"] for h in HIST)
    year_capex = {p["year"]: p["capex_pct"] for p in YEAR_PLAN}
    rows = []
    for y in YEARS:
        for h in HIST:
            s = h["segment"]
            rev = h["fy2026"]
            for yy in YEARS:
                if yy <= y:
                    rev *= 1 + plan[(s, yy)]["growth"]
            ebitda = rev * plan[(s, y)]["margin"]
            seg_rows.append({"segment": s, "year": y, "revenue": rev, "ebitda": ebitda})
            by_year[y]["revenue"] += rev
            by_year[y]["ebitda"] += ebitda
    for y in YEARS:
        rev = by_year[y]["revenue"]
        rows.append({
            "year": y,
            "revenue": rev,
            "ebitda": by_year[y]["ebitda"],
            "da": A["da_pct"] * rev,
            "capex": year_capex[y] * rev,
            "delta_nwc": A["nwc_pct"] * (rev - (rows[-1]["revenue"] if rows else prior_total)),
        })
    return seg_rows, rows


def sources_uses(ltm, overrides=None):
    o = overrides or {}
    entry_multiple = o.get("entry_multiple", A["entry_multiple"])
    tlb_turns = o.get("tlb_turns", A["tlb_turns"])
    ev = entry_multiple * ltm
    purchase_equity = ev - A["existing_debt"] + A["existing_cash"]
    tlb0 = tlb_turns * ltm
    mezz0 = A["mezz_turns"] * ltm
    txn_fees = A["txn_fee_pct"] * ev
    fin_fees = A["fin_fee_pct"] * (tlb0 + mezz0)
    uses = purchase_equity + A["existing_debt"] + txn_fees + fin_fees
    cash_used = A["existing_cash"] - A["min_cash"]
    sponsor_equity = uses - tlb0 - mezz0 - cash_used
    return {
        "entry_ev": ev, "purchase_equity": purchase_equity, "tlb0": tlb0, "mezz0": mezz0,
        "txn_fees": txn_fees, "fin_fees": fin_fees, "uses": uses, "cash_used": cash_used,
        "sponsor_equity": sponsor_equity,
        "sources": tlb0 + mezz0 + cash_used + sponsor_equity,
    }


def year_pass(op, su, bal, mode):
    """One year of the debt waterfall given opening balances.

    mode 'begin': cash interest on beginning balances (no circularity).
    mode 'avg':   cash interest on average balances — within-year circular; the caller
                  iterates this pass to a fixed point.
    """
    if mode == "begin":
        e_tlb, e_mezz, e_rev, e_undrawn = bal["tlb"], bal["mezz"], bal["rev"], max(0.0, A["revolver_capacity"] - bal["rev"])
    else:
        e_tlb = (bal["tlb"] + bal["est"]["tlb"]) / 2
        e_mezz = (bal["mezz"] + bal["est"]["mezz"]) / 2
        e_rev = (bal["rev"] + bal["est"]["rev"]) / 2
        e_undrawn = max(0.0, (A["revolver_capacity"] - bal["rev"] + A["revolver_capacity"] - bal["est"]["rev"]) / 2)
    interest = A["tlb_rate"] * e_tlb + A["mezz_cash_rate"] * e_mezz + A["revolver_rate"] * e_rev + A["commitment_fee"] * e_undrawn
    ebt = op["ebitda"] - op["da"] - interest
    tax = max(0.0, ebt * A["tax_rate"])
    ni = ebt - tax
    cfadr = ni + op["da"] - op["capex"] - op["delta_nwc"]
    rev_repay = min(bal["rev"], max(0.0, cfadr))
    rev_draw = min(max(0.0, A["revolver_capacity"] - bal["rev"]), max(0.0, -cfadr))
    res1 = cfadr - rev_repay + rev_draw
    mand = min(A["tlb_amort_pct"] * su["tlb0"], bal["tlb"])
    res2 = res1 - mand
    draw2 = min(max(0.0, A["revolver_capacity"] - (bal["rev"] + rev_draw)), max(0.0, -res2))
    res2 = res2 + draw2
    sweep = min(A["cash_sweep_pct"] * max(0.0, res2), bal["tlb"] - mand)
    end = {
        "rev": bal["rev"] + rev_draw + draw2 - rev_repay,
        "tlb": bal["tlb"] - mand - sweep,
        "mezz": bal["mezz"] * (1 + A["mezz_pik_rate"]),
        "cash": bal["cash"] + res2 - sweep,
    }
    return {"interest": interest, "ebt": ebt, "tax": tax, "ni": ni, "cfadr": cfadr,
            "rev_repay": rev_repay, "rev_draw": rev_draw + draw2, "mand": mand,
            "sweep": sweep, "retained": res2 - sweep, "end": end}


def schedule(ops, su, mode):
    """The 5-year roll-forward. 'avg' iterates each year to a fixed point (≤ 1e-12)."""
    bal = {"rev": 0.0, "tlb": su["tlb0"], "mezz": su["mezz0"], "cash": A["min_cash"], "est": None}
    rows = []
    iterations = 0
    for op in ops:
        if mode == "begin":
            out = year_pass(op, su, bal, "begin")
        else:
            est = None
            for _ in range(200):
                bal["est"] = est if est else {"rev": bal["rev"], "tlb": bal["tlb"], "mezz": bal["mezz"]}
                out = year_pass(op, su, bal, "avg")
                e = out["end"]
                if est and all(abs(e[k] - est[k]) < 1e-12 for k in ("rev", "tlb", "mezz", "cash")):
                    est = e
                    break
                est = e
                iterations += 1
            bal["est"] = None
        end = out["end"]
        net_debt = end["tlb"] + end["mezz"] + end["rev"] - end["cash"]
        rows.append({
            "year": op["year"], "ebitda": op["ebitda"], "interest": out["interest"],
            "cfadr": out["cfadr"], "mand": out["mand"], "sweep": out["sweep"],
            "retained": out["retained"], "rev_draw": out["rev_draw"], "rev_repay": out["rev_repay"],
            "tlb_end": end["tlb"], "mezz_end": end["mezz"], "rev_end": end["rev"], "cash_end": end["cash"],
            "net_debt": net_debt,
            "leverage": net_debt / op["ebitda"], "coverage": op["ebitda"] / out["interest"],
        })
        bal = {"rev": end["rev"], "tlb": end["tlb"], "mezz": end["mezz"], "cash": end["cash"], "est": None}
    return rows, iterations


def irr(flows, lo=-0.99, hi=10.0):
    """Bisection IRR (the flows have one sign change, so NPV(r) is monotone)."""
    def npv(r):
        return sum(cf / (1 + r) ** t for t, cf in enumerate(flows))
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(mid) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def run_model(overrides=None):
    """The whole model as one pure function — what the sensitivity grid maps over."""
    o = overrides or {}
    ltm = ltm_ebitda()
    _, ops = build_operating()
    su = sources_uses(ltm, o)
    sched, _ = schedule(ops, su, "begin")
    exit_multiple = o.get("exit_multiple", A["exit_multiple"])
    last, last_s = ops[-1], sched[-1]
    exit_ev = exit_multiple * last["ebitda"]
    net_debt = last_s["net_debt"]
    exit_equity = exit_ev - net_debt
    flows = [-su["sponsor_equity"]] + [0.0] * (A["hold_years"] - 1) + [exit_equity]
    return {
        "exit_ev": exit_ev, "net_debt": net_debt, "exit_equity": exit_equity,
        "sponsor_equity": su["sponsor_equity"],
        "moic": exit_equity / su["sponsor_equity"], "irr": irr(flows),
    }


def breakeven_exit_multiple(hurdle):
    """Goal seek: the exit multiple at which IRR = hurdle (IRR is increasing in it)."""
    lo, hi = 4.0, 12.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if run_model({"exit_multiple": mid})["irr"] < hurdle:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# ── compute the truth ─────────────────────────────────────────────────────────
ltm = ltm_ebitda()
seg_rows, ops = build_operating()
_, holdout_ops = build_operating(HOLDOUT_PLAN)
su = sources_uses(ltm)
sched, _ = schedule(ops, su, "begin")
sched_avg, avg_iters = schedule(ops, su, "avg")

exit_ev = A["exit_multiple"] * ops[-1]["ebitda"]
net_debt = sched[-1]["net_debt"]
exit_equity = exit_ev - net_debt
flows = [-su["sponsor_equity"]] + [0.0] * 4 + [exit_equity]
irr_base = irr(flows)
exit_ev_avg = A["exit_multiple"] * ops[-1]["ebitda"]  # same operating plan
exit_equity_avg = exit_ev_avg - sched_avg[-1]["net_debt"]
irr_avg = irr([-su["sponsor_equity"]] + [0.0] * 4 + [exit_equity_avg])

grid = []
for exit_m in [7.0, 7.5, 8.0, 8.5, 9.0]:
    for tlb_turns in [4.0, 4.5, 5.0, 5.5, 6.0]:
        r = run_model({"exit_multiple": exit_m, "tlb_turns": tlb_turns})
        grid.append({"exit_multiple": exit_m, "tlb_turns": tlb_turns,
                     "sponsor_equity": r["sponsor_equity"], "exit_equity": r["exit_equity"],
                     "moic": r["moic"], "irr": r["irr"]})

breakeven = breakeven_exit_multiple(A["hurdle_irr"])

# sanity: conservation actually holds (this is what the Reckoner conservation() tests pin)
su_delta = su["sources"] - su["uses"]
roll_delta = max(abs(r["tlb_end"] - r["tlb_end"]) for r in sched)  # placeholder 0; real check below
prev = {"tlb": su["tlb0"], "mezz": su["mezz0"], "rev": 0.0}
roll_resid = 0.0
for i, r in enumerate(sched):
    mand_sweep = r["mand"] + r["sweep"]
    roll_resid = max(roll_resid,
                     abs(r["tlb_end"] - (prev["tlb"] - mand_sweep)),
                     abs(r["mezz_end"] - prev["mezz"] * (1 + A["mezz_pik_rate"])),
                     abs(r["rev_end"] - (prev["rev"] + r["rev_draw"] - r["rev_repay"])))
    prev = {"tlb": r["tlb_end"], "mezz": r["mezz_end"], "rev": r["rev_end"]}

expected = {
    "ltm_ebitda": ltm,
    "sources_uses": {k: su[k] for k in su},
    "su_delta": su_delta,
    "rollforward_residual": roll_resid,
    "avg_mode_fixed_point_iterations": avg_iters,
    "operating": ops,
    "schedule": sched,
    "schedule_avg_last": sched_avg[-1],
    "exit": {"exit_ev": exit_ev, "net_debt": net_debt, "exit_equity": exit_equity,
             "moic": exit_equity / su["sponsor_equity"], "irr": irr_base},
    "exit_avg": {"exit_equity": exit_equity_avg, "irr": irr_avg},
    "breakeven_exit_multiple": breakeven,
    "sensitivity_grid": grid,
    "holdout_operating": holdout_ops,
    "covenants": {"leverage_max": max(r["leverage"] for r in sched),
                  "coverage_min": min(r["coverage"] for r in sched),
                  "cash_min": min(r["cash_end"] for r in sched),
                  "leverage_threshold": COV_LEVERAGE_MAX, "coverage_threshold": COV_COVERAGE_MIN},
}

# ── write the data CSVs ───────────────────────────────────────────────────────
with open(os.path.join(DATA, "historical_segments.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["segment", "fy2024", "fy2025", "fy2026", "margin_fy2026"])
    w.writeheader()
    for h in HIST:
        w.writerow(h)

with open(os.path.join(DATA, "ops_plan.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["segment", "year", "growth", "margin"])
    for s in SEGMENTS:
        for y in YEARS:
            p = PLAN[(s, y)]
            w.writerow([s, y, p["growth"], p["margin"]])

with open(os.path.join(DATA, "year_plan.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["year", "capex_pct"])
    w.writeheader()
    for p in YEAR_PLAN:
        w.writerow(p)

with open(os.path.join(DATA, "assumptions.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["assumption", "value"])
    for k, v in A.items():
        w.writerow([k, v])

# ── write the document fixtures (frozen frames; synthetic provenance) ─────────
def frame(rows, note):
    return {"rows": rows,
            "provenance": {"synthetic": True, "captureActor": "generate.py",
                           "capturedAt": "2026-07-09", "note": note}}

fixtures = {
    "assumptions": frame([dict(A)], "deal assumptions; the three deal knobs are mirrored as params"),
    "historical_segments": frame(HIST, "FY2024-26 segment revenue + FY2026 margins (LTM at close)"),
    "ops_plan": frame([{"segment": s, "year": y, **PLAN[(s, y)]} for s in SEGMENTS for y in YEARS],
                      "management plan: growth + margin per segment-year"),
    "year_plan": frame(YEAR_PLAN, "company-level plan vectors (capex % of revenue)"),
    "ops_plan_holdout": frame(
        [{"segment": s, "year": y, **HOLDOUT_PLAN[(s, y)]} for s in SEGMENTS for y in YEARS],
        "the downside holdout plan (growth -2pp, margins -0.5pp) — the substitution fixture for the ops_holdout test (R3-373)"),
    "expected_holdout": frame([{
        "fy2031_revenue": holdout_ops[-1]["revenue"],
        "fy2031_ebitda": holdout_ops[-1]["ebitda"],
        "fy2027_revenue": holdout_ops[0]["revenue"],
    }], "Python-verified operating build under the holdout plan (the ops_holdout oracle)"),
    "expected_values": frame([{
        "ltm_ebitda": ltm,
        "entry_ev": su["entry_ev"], "sponsor_equity": su["sponsor_equity"],
        "uses_total": su["uses"],
        "exit_ev": exit_ev, "exit_equity": exit_equity,
        "moic": exit_equity / su["sponsor_equity"], "irr": irr_base,
        "irr_avg": irr_avg, "breakeven_exit_multiple": breakeven,
        "tlb_end_2031": sched[-1]["tlb_end"], "cash_end_2031": sched[-1]["cash_end"],
        "net_debt_2031": net_debt,
        "fy2031_revenue": ops[-1]["revenue"], "fy2031_ebitda": ops[-1]["ebitda"],
        "net_debt_2031_avg": sched_avg[-1]["net_debt"],
    }], "Python-verified spot values (the specification-test oracle)"),
}
for name, fr in fixtures.items():
    with open(os.path.join(DOC, "fixtures", f"{name}.frame.json"), "w") as f:
        json.dump(fr, f, indent=2)
        f.write("\n")

with open(os.path.join(HERE, "expected.json"), "w") as f:
    json.dump(expected, f, indent=2)
    f.write("\n")

# ── the Excel "before" (live formulas; a hand-rolled xlsx writer, no deps) ─────
from xlsx_writer import write_workbook  # local module, stdlib-only

XLSX = os.path.join(HERE, "caldera_lbo.xlsx")
write_workbook(XLSX, HIST, PLAN, YEAR_PLAN, A, su, ops, sched, expected)

# well-formedness gate: every XML part must parse; the zip must be intact.
import zipfile
from xml.dom import minidom
with zipfile.ZipFile(XLSX) as z:
    assert z.testzip() is None
    for part in z.namelist():
        if part.endswith(".xml") or part.endswith(".rels"):
            minidom.parseString(z.read(part))
print(f"caldera_lbo.xlsx       {len(zipfile.ZipFile(XLSX).namelist())} parts, XML valid")

print(f"ltm_ebitda            {ltm:.4f}")
print(f"entry_ev              {su['entry_ev']:.4f}")
print(f"sponsor_equity        {su['sponsor_equity']:.4f}")
print(f"su_delta              {su_delta:.2e}")
print(f"rollforward residual  {roll_resid:.2e}")
print(f"exit_equity           {exit_equity:.4f}  moic {exit_equity / su['sponsor_equity']:.4f}x")
print(f"irr                   {irr_base:.6%}   (avg-balance variant {irr_avg:.6%}, "
      f"fixed-point iters/yr {avg_iters / 5:.1f})")
print(f"breakeven exit mult   {breakeven:.4f}x for {A['hurdle_irr']:.0%} IRR")
print(f"covenant worst        leverage {max(r['leverage'] for r in sched):.3f}x "
      f"(≤{COV_LEVERAGE_MAX}x), coverage {min(r['coverage'] for r in sched):.3f}x "
      f"(≥{COV_COVERAGE_MIN}x), cash min {min(r['cash_end'] for r in sched):.3f}")
print("grid corners          "
      f"{grid[0]['irr']:.4%} (7.0x,4.0x) … {grid[-1]['irr']:.4%} (9.0x,6.0x)")
print("wrote data/, document/fixtures/, expected.json, caldera_lbo.xlsx")
