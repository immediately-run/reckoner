import { cell, table, rollforward, cumprod, irr, solve, fixpoint, sum } from "@reckoner/stdlib";

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
//   Returns            → `returns`, `sponsor_irr`, `moic`, `breakeven_exit_multiple`
//
// Naming note: a worksheet export shadows any same-named stdlib callable in module
// scope (the import is stripped; stdlib functions arrive as compartment globals) —
// hence `sponsor_irr`, not `irr`, for the scalar tile.
//
// Everything below is pure: plain values in, plain values out, no ambient
// anything. The module-scope helpers are the "model as a function" the
// sensitivity grid needs — a cell cannot re-run other cells, so the model must
// decompose into callable pure functions (the architectural finding this case
// study exists to document).

const YEARS_ORDER = "year";

// ── module-scope model helpers (shared by cells and the grid) ────────────────
// (The hand-rolled npv/irrBisect that lived here is R3-376's receipt: the stdlib's
// irr() replaced it, deleted rather than kept.)

// The operating build: segment revenue paths (base × the compounded growth factors via
// cumprod), margin-weighted EBITDA, D&A / capex / ΔNWC per year. Fluent stdlib throughout.
function buildOperating(hist, plan, yearPlan, a) {
  const baseTotal = hist.reduce((acc, h) => acc + h.fy2026, 0);
  const paths = table(hist)
    .join(plan, { on: "segment" })
    .derive({ growth_factor: (r) => 1 + r.growth })
    .scan(
      { factor_path: cumprod("growth_factor") },
      { partitionBy: "segment", orderBy: YEARS_ORDER },
    )
    .derive({ seg_revenue: (r) => r.fy2026 * r.factor_path, seg_ebitda: (r) => r.fy2026 * r.factor_path * r.margin })
    .groupBy("year")
    .rollup({ revenue: sum("seg_revenue"), ebitda: sum("seg_ebitda") })
    .rows();
  return table(paths)
    .sort(YEARS_ORDER)
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

// The 5-year roll-forward on the stdlib's multi-state primitive (R3-375): the
// state tuple {rev, tlb, mezz, cash} evolves through each year's waterfall —
// the structure Excel unrolls across columns. 'avg' mode iterates each year's
// step to a fixed point (Excel's iterative-calc circular reference, explicit).
function scheduleYears(ops, a, su, mode) {
  let iterations = 0;
  return rollforward(ops, {
    orderBy: YEARS_ORDER,
    begin: { rev: 0, tlb: su.tlb0, mezz: su.mezz0, cash: a.min_cash },
    step: (op, bal) => {
      let out;
      if (mode === "begin") {
        out = yearPass(op, a, su, bal, "begin");
      } else {
        // The within-year fixed point on the stdlib's fixpoint helper (R3-378):
        // iterate the average-balance estimate until it stops moving, then take
        // one final pass at the converged state so the year's output columns are
        // exactly consistent with it. Non-convergence surfaces as a thrown error
        // — visible, the opposite of Excel's silent iterative calc.
        const trial = { rev: bal.rev, tlb: bal.tlb, mezz: bal.mezz, cash: bal.cash, est: null };
        let lastOut = null;
        const fp = fixpoint(
          { rev: bal.rev, tlb: bal.tlb, mezz: bal.mezz, cash: bal.cash },
          (est) => {
            trial.est = est;
            const pass = yearPass(op, a, su, trial, "avg");
            lastOut = pass;
            return pass.end;
          },
          { tol: 1e-12, maxIterations: 200 },
        );
        if (!fp.converged) {
          throw new Error("average-balance interest did not converge in year " + op.year);
        }
        iterations += fp.iterations;
        out = lastOut;
      }
      const netDebt = out.end.tlb + out.end.mezz + out.end.rev - out.end.cash;
      return {
        out: {
          interest: out.interest, cfadr: out.cfadr, mand: out.mand, sweep: out.sweep,
          retained: out.retained, rev_draw: out.rev_draw, rev_repay: out.rev_repay,
          net_debt: netDebt, leverage: netDebt / op.ebitda, coverage: op.ebitda / out.interest,
          iterations,
        },
        next: out.end,
      };
    },
  });
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
    moic: exit_equity / su.sponsor_equity, irr: irr(flows),
  };
}

// Goal seek: the exit multiple at which IRR = hurdle (IRR is increasing in it).
// Excel does this interactively (Data → What-If → Goal Seek); here it is an
// explicit bisection, so it recomputes with the model and is testable.
function breakevenExitMultiple(a, hist, plan, yearPlan, hurdle) {
  // Goal seek on the stdlib's solve (R3-381): IRR is increasing in the exit
  // multiple, so the bracket is monotone and bisection is exact.
  return solve((m) => runModel(a, hist, plan, yearPlan, { exit_multiple: m }).irr, hurdle, 4.0, 12.0);
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
      moic: exit_equity / su.sponsor_equity, irr: irr(flows),
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
    return { exit_ev, exit_equity, irr: irr(flows), moic: exit_equity / su.sponsor_equity };
  },
});

// Thin named scalars the template and tests bind to.
export const sponsor_irr = cell({
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
