import { cell, table, derive, scan, sort, sum } from "@reckoner/stdlib";

// Caldera Components LBO — the model worksheet.
//
// Structure mirrors the Excel "before" (caldera_lbo.xlsx) tab for tab:
//   Assumptions        → fixtures.assumptions + the three params.* deal knobs
//   Operating_Model    → `ltm_ebitda`, `operating`
//   Sources_Uses       → `sources_uses`
//   Debt_Schedule      → `debt_schedule` (begin-balance interest) and
//                        `debt_schedule_avg` (average-balance interest — Excel's
//                        iterative-calc circular reference, here an explicit,
//                        per-year converged fixed point inside one cell)
//   Sens_Models/grid   → `sensitivity` (25 full model re-runs)
//   Returns            → `returns`, `irr`, `moic`, `breakeven_exit_multiple`
//
// Everything below is pure: plain values in, plain values out, no ambient
// anything. The module-scope helpers are the "model as a function" the
// sensitivity grid needs — a cell cannot re-run other cells, so the model must
// decompose into callable pure functions (the architectural finding this case
// study exists to document).

const YEARS_ORDER = "year";

// ── module-scope model helpers (shared by cells and the grid) ────────────────

function npv(rate, flows) {
  let total = 0;
  for (let t = 0; t < flows.length; t += 1) total += flows[t] / Math.pow(1 + rate, t);
  return total;
}

// Bisection IRR — the flows have one sign change, so NPV(r) is monotone.
// Excel ships IRR(); the stdlib does not (a gap this case study records).
function irrBisect(flows) {
  let lo = -0.99;
  let hi = 10.0;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (npv(mid, flows) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// The operating build: segment revenue paths (chained growth via a custom
// cumulative-product scan — cumsum exists, cumprod does not), margin-weighted
// EBITDA, D&A / capex / ΔNWC per year. Fluent stdlib throughout.
function buildOperating(hist, plan, yearPlan, a) {
  const baseTotal = hist.reduce((acc, h) => acc + h.fy2026, 0);
  const paths = table(hist)
    .join(plan, { on: "segment" })
    .scan(
      { seg_revenue: (part) => {
        let r = null;
        return part.map((row) => {
          r = r === null ? row.fy2026 * (1 + row.growth) : r * (1 + row.growth);
          return r;
        });
      } },
      { partitionBy: "segment", orderBy: YEARS_ORDER },
    )
    .derive({ seg_ebitda: (r) => r.seg_revenue * r.margin })
    .groupBy("year")
    .rollup({ revenue: sum("seg_revenue"), ebitda: sum("seg_ebitda") })
    .rows();
  return table(sort(paths, YEARS_ORDER))
    .lag("revenue", { as: "prior_revenue", fill: baseTotal })
    .join(yearPlan, { on: "year" })
    .derive({
      da: (r) => a.da_pct * r.revenue,
      capex: (r) => r.capex_pct * r.revenue,
      delta_nwc: (r) => a.nwc_pct * (r.revenue - r.prior_revenue),
    })
    .rows()
    .map((r) => ({
      year: r.year, revenue: r.revenue, ebitda: r.ebitda,
      da: r.da, capex: r.capex, delta_nwc: r.delta_nwc,
    }));
}

function sourcesUses(ltm, a, entryMultiple, tlbTurns) {
  const ev = entryMultiple * ltm;
  const purchase_equity = ev - a.existing_debt + a.existing_cash;
  const tlb0 = tlbTurns * ltm;
  const mezz0 = a.mezz_turns * ltm;
  const txn_fees = a.txn_fee_pct * ev;
  const fin_fees = a.fin_fee_pct * (tlb0 + mezz0);
  const uses = purchase_equity + a.existing_debt + txn_fees + fin_fees;
  const cash_used = a.existing_cash - a.min_cash;
  const sponsor_equity = uses - tlb0 - mezz0 - cash_used;
  return {
    entry_ev: ev, purchase_equity, tlb0, mezz0, txn_fees, fin_fees,
    uses, cash_used, sponsor_equity, sources: tlb0 + mezz0 + cash_used + sponsor_equity,
  };
}

// One year of the debt waterfall given opening balances. mode "begin" charges
// interest on beginning balances; mode "avg" on average balances, where `est`
// is the current fixed-point estimate of the ending balances (the caller
// iterates). Mirrors generate.py `year_pass` operation for operation.
function yearPass(op, a, su, bal, mode) {
  let e_tlb, e_mezz, e_rev, e_undrawn;
  if (mode === "begin") {
    e_tlb = bal.tlb; e_mezz = bal.mezz; e_rev = bal.rev;
    e_undrawn = Math.max(0, a.revolver_capacity - bal.rev);
  } else {
    e_tlb = (bal.tlb + bal.est.tlb) / 2;
    e_mezz = (bal.mezz + bal.est.mezz) / 2;
    e_rev = (bal.rev + bal.est.rev) / 2;
    e_undrawn = Math.max(0, (a.revolver_capacity - bal.rev + a.revolver_capacity - bal.est.rev) / 2);
  }
  const interest = a.tlb_rate * e_tlb + a.mezz_cash_rate * e_mezz + a.revolver_rate * e_rev + a.commitment_fee * e_undrawn;
  const ebt = op.ebitda - op.da - interest;
  const tax = Math.max(0, ebt * a.tax_rate);
  const ni = ebt - tax;
  const cfadr = ni + op.da - op.capex - op.delta_nwc;
  const rev_repay = Math.min(bal.rev, Math.max(0, cfadr));
  const rev_draw = Math.min(Math.max(0, a.revolver_capacity - bal.rev), Math.max(0, -cfadr));
  const res1 = cfadr - rev_repay + rev_draw;
  const mand = Math.min(a.tlb_amort_pct * su.tlb0, bal.tlb);
  let res2 = res1 - mand;
  const draw2 = Math.min(Math.max(0, a.revolver_capacity - (bal.rev + rev_draw)), Math.max(0, -res2));
  res2 = res2 + draw2;
  const sweep = Math.min(a.cash_sweep_pct * Math.max(0, res2), bal.tlb - mand);
  const end = {
    rev: bal.rev + rev_draw + draw2 - rev_repay,
    tlb: bal.tlb - mand - sweep,
    mezz: bal.mezz * (1 + a.mezz_pik_rate),
    cash: bal.cash + res2 - sweep,
  };
  return {
    begin: { rev: bal.rev, tlb: bal.tlb, mezz: bal.mezz, cash: bal.cash },
    interest, ebt, tax, ni, cfadr, mand, sweep, retained: res2 - sweep,
    rev_draw: rev_draw + draw2, rev_repay, end,
  };
}

// The 5-year roll-forward as a multi-state fold. This is the structure Excel
// calls a "debt schedule" (unrolled across columns); here it is one custom
// packed-state scan op — the stdlib has cumsum/cummax but no multi-state
// roll-forward primitive (a gap this case study records).
function scheduleYears(ops, a, su, mode) {
  let iterations = 0;
  const stateful = (part) => {
    let bal = { rev: 0, tlb: su.tlb0, mezz: su.mezz0, cash: a.min_cash, est: null };
    return part.map((op) => {
      let out;
      if (mode === "begin") {
        out = yearPass(op, a, su, bal, "begin");
      } else {
        let est = null;
        for (let i = 0; i < 200; i += 1) {
          bal.est = est === null ? { rev: bal.rev, tlb: bal.tlb, mezz: bal.mezz } : est;
          out = yearPass(op, a, su, bal, "avg");
          const e = out.end;
          if (est !== null &&
              Math.abs(e.rev - est.rev) < 1e-12 && Math.abs(e.tlb - est.tlb) < 1e-12 &&
              Math.abs(e.mezz - est.mezz) < 1e-12 && Math.abs(e.cash - est.cash) < 1e-12) {
            est = e;
            break;
          }
          est = e;
          iterations += 1;
        }
        bal.est = null;
      }
      bal = { rev: out.end.rev, tlb: out.end.tlb, mezz: out.end.mezz, cash: out.end.cash, est: null };
      return out;
    });
  };
  const packed = scan(ops, { state: stateful }, { orderBy: YEARS_ORDER });
  return derive(packed, {
    year: (r) => r.year,
    ebitda: (r) => r.ebitda,
    interest: (r) => r.state.interest,
    cfadr: (r) => r.state.cfadr,
    mand: (r) => r.state.mand,
    sweep: (r) => r.state.sweep,
    retained: (r) => r.state.retained,
    rev_draw: (r) => r.state.rev_draw,
    rev_repay: (r) => r.state.rev_repay,
    tlb_begin: (r) => r.state.begin.tlb,
    tlb_end: (r) => r.state.end.tlb,
    mezz_begin: (r) => r.state.begin.mezz,
    mezz_end: (r) => r.state.end.mezz,
    rev_end: (r) => r.state.end.rev,
    cash_end: (r) => r.state.end.cash,
    net_debt: (r) => r.state.end.tlb + r.state.end.mezz + r.state.end.rev - r.state.end.cash,
    leverage: (r) => (r.state.end.tlb + r.state.end.mezz + r.state.end.rev - r.state.end.cash) / r.ebitda,
    coverage: (r) => r.ebitda / r.state.interest,
  }).map((r) => ({ ...r, iterations }));
}

// The whole model as one pure function of the fixtures + overrides — what the
// sensitivity grid maps over and the breakeven goal-seek bisects on. This
// decomposition is *forced* by Reckoner's no-ambient-registry rule: a cell
// cannot re-run other cells with different params, so the model must be a
// function before it can be swept.
function runModel(a, hist, plan, yearPlan, o) {
  const overrides = o || {};
  const ltm = hist.reduce((acc, h) => acc + h.fy2026 * h.margin_fy2026, 0);
  const ops = buildOperating(hist, plan, yearPlan, a);
  const su = sourcesUses(ltm, a,
    overrides.entry_multiple === undefined ? a.entry_multiple : overrides.entry_multiple,
    overrides.tlb_turns === undefined ? a.tlb_turns : overrides.tlb_turns);
  const sched = scheduleYears(ops, a, su, "begin");
  const last = ops[ops.length - 1];
  const lastS = sched[sched.length - 1];
  const exitMultiple = overrides.exit_multiple === undefined ? a.exit_multiple : overrides.exit_multiple;
  const exit_ev = exitMultiple * last.ebitda;
  const exit_equity = exit_ev - lastS.net_debt;
  const flows = [-su.sponsor_equity].concat(Array(a.hold_years - 1).fill(0)).concat([exit_equity]);
  return {
    su, exit_ev, net_debt: lastS.net_debt, exit_equity,
    moic: exit_equity / su.sponsor_equity, irr: irrBisect(flows),
  };
}

// Goal seek: the exit multiple at which IRR = hurdle (IRR is increasing in it).
// Excel does this interactively (Data → What-If → Goal Seek); here it is an
// explicit bisection, so it recomputes with the model and is testable.
function breakevenExitMultiple(a, hist, plan, yearPlan, hurdle) {
  let lo = 4.0;
  let hi = 12.0;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (runModel(a, hist, plan, yearPlan, { exit_multiple: mid }).irr < hurdle) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── cells ─────────────────────────────────────────────────────────────────────

export const ltm_ebitda = cell({
  doc: "LTM (FY2026) EBITDA at close, EUR m — the entry multiple's base",
  inputs: { hist: "fixtures.historical_segments" },
  formula: ({ hist }) => hist.reduce((acc, h) => acc + h.fy2026 * h.margin_fy2026, 0),
});

export const operating = cell({
  doc: "Five-year operating build: revenue by chained segment growth, margin-weighted EBITDA, D&A, capex, ΔNWC — one row per year FY2027–FY2031",
  inputs: {
    hist: "fixtures.historical_segments",
    plan: "fixtures.ops_plan",
    yearPlan: "fixtures.year_plan",
    a: "fixtures.assumptions",
  },
  formula: ({ hist, plan, yearPlan, a }) => buildOperating(hist, plan, yearPlan, a[0]),
});

export const sources_uses = cell({
  doc: "Sources & uses at close (EUR m): entry EV, purchase equity, fees, funded debt, and the sponsor equity plug. The interactive deal knobs are params",
  inputs: { ltm: "model.ltm_ebitda", a: "fixtures.assumptions", entry: "params.entry_multiple", tlbTurns: "params.tlb_turns" },
  formula: ({ ltm, a, entry, tlbTurns }) => sourcesUses(ltm, a[0], entry, tlbTurns),
});

// One-row projection of sources_uses shaped for the conservation test:
// components (debt + cash + equity) must sum to total uses, row-wise.
export const sources_uses_row = cell({
  doc: "Sources & uses as a single conservation row: tlb0 + mezz0 + cash_used + sponsor_equity = uses",
  inputs: { su: "model.sources_uses" },
  formula: ({ su }) => [{
    tlb0: su.tlb0, mezz0: su.mezz0, cash_used: su.cash_used,
    sponsor_equity: su.sponsor_equity, uses_total: su.uses,
  }],
});

export const debt_schedule = cell({
  doc: "Debt schedule FY2027–FY2031, interest on beginning balances (no circularity): revolver draw/repay, TLB mandatory amortisation + 75% cash sweep, mezzanine PIK accrual, cash build, leverage and coverage",
  inputs: { ops: "model.operating", su: "model.sources_uses", a: "fixtures.assumptions" },
  formula: ({ ops, su, a }) => scheduleYears(ops, a[0], su, "begin"),
});

export const debt_schedule_avg = cell({
  doc: "Debt schedule with interest on AVERAGE balances — Excel's iterative-calc circular reference, expressed as an explicit per-year fixed point converged to 1e-12; rows carry the iteration count",
  inputs: { ops: "model.operating", su: "model.sources_uses", a: "fixtures.assumptions" },
  formula: ({ ops, su, a }) => scheduleYears(ops, a[0], su, "avg"),
});

export const returns = cell({
  doc: "Exit returns at FY2031: exit EV at the exit multiple, less net debt, → sponsor equity value, MOIC and IRR (bisection on the annual flows)",
  inputs: {
    ops: "model.operating", sched: "model.debt_schedule", su: "model.sources_uses",
    a: "fixtures.assumptions", exit: "params.exit_multiple",
  },
  formula: ({ ops, sched, su, a, exit }) => {
    const last = ops[ops.length - 1];
    const lastS = sched[sched.length - 1];
    const exit_ev = exit * last.ebitda;
    const exit_equity = exit_ev - lastS.net_debt;
    const flows = [-su.sponsor_equity].concat(Array(a[0].hold_years - 1).fill(0)).concat([exit_equity]);
    return {
      exit_ev, net_debt: lastS.net_debt, exit_equity, sponsor_equity: su.sponsor_equity,
      moic: exit_equity / su.sponsor_equity, irr: irrBisect(flows),
    };
  },
});

export const returns_avg = cell({
  doc: "Exit returns under the average-balance (converged circular) debt schedule — the answer Excel's iterative sheet would give",
  inputs: {
    ops: "model.operating", sched: "model.debt_schedule_avg", su: "model.sources_uses",
    a: "fixtures.assumptions", exit: "params.exit_multiple",
  },
  formula: ({ ops, sched, su, a, exit }) => {
    const last = ops[ops.length - 1];
    const lastS = sched[sched.length - 1];
    const exit_ev = exit * last.ebitda;
    const exit_equity = exit_ev - lastS.net_debt;
    const flows = [-su.sponsor_equity].concat(Array(a[0].hold_years - 1).fill(0)).concat([exit_equity]);
    return { exit_ev, exit_equity, irr: irrBisect(flows), moic: exit_equity / su.sponsor_equity };
  },
});

// Thin named scalars the template and tests bind to.
export const irr = cell({
  doc: "Base-case sponsor IRR as a scalar, for the Kpi tile",
  inputs: { r: "model.returns" },
  formula: ({ r }) => r.irr,
});

export const moic = cell({
  doc: "Base-case sponsor MOIC (x) as a scalar, for the Kpi tile",
  inputs: { r: "model.returns" },
  formula: ({ r }) => r.moic,
});

export const sponsor_equity = cell({
  doc: "Sponsor equity cheque at close (EUR m), for the Kpi tile",
  inputs: { su: "model.sources_uses" },
  formula: ({ su }) => su.sponsor_equity,
});

export const sensitivity = cell({
  doc: "Two-way sensitivity: sponsor IRR and MOIC for exit multiple 7.0–9.0x × TLB leverage 4.0–6.0x — 25 full model re-runs over the base fixtures (not the live params)",
  inputs: {
    a: "fixtures.assumptions", hist: "fixtures.historical_segments",
    plan: "fixtures.ops_plan", yearPlan: "fixtures.year_plan",
  },
  formula: ({ a, hist, plan, yearPlan }) => {
    const exitMults = [7.0, 7.5, 8.0, 8.5, 9.0];
    const levs = [4.0, 4.5, 5.0, 5.5, 6.0];
    const rows = [];
    for (const exit_m of exitMults) {
      for (const lev of levs) {
        const r = runModel(a[0], hist, plan, yearPlan, { exit_multiple: exit_m, tlb_turns: lev });
        rows.push({
          exit_multiple: exit_m, tlb_turns: lev,
          sponsor_equity: r.su.sponsor_equity, exit_equity: r.exit_equity,
          moic: r.moic, irr: r.irr,
        });
      }
    }
    return rows;
  },
});

export const breakeven_exit_multiple = cell({
  doc: "Goal seek: the exit multiple at which the sponsor IRR equals the 20% hurdle (IRR is monotone in the exit multiple)",
  inputs: {
    a: "fixtures.assumptions", hist: "fixtures.historical_segments",
    plan: "fixtures.ops_plan", yearPlan: "fixtures.year_plan",
  },
  formula: ({ a, hist, plan, yearPlan }) => breakevenExitMultiple(a[0], hist, plan, yearPlan, a[0].hurdle_irr),
});
