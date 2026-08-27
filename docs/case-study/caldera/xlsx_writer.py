#!/usr/bin/env python3
"""
Minimal dependency-free .xlsx writer for the Caldera LBO "before" workbook.

Writes a real Excel file (a zip of XML parts) carrying LIVE formulas — no cached
values, with `fullCalcOnLoad` so Excel/LibreOffice compute everything on open —
plus defined names (named ranges) and iterative-calc enabled (the average-balance
interest sheet is deliberately circular, exactly like real LBO models).

The point is the *shape* of the Excel artifact finance people actually build:
years across columns, unrolled roll-forwards, MIN/MAX revolver logic, named
assumption cells, an IRR() over a flows row, a hand-rolled two-way sensitivity
grid, and a checks column of IF(...,"OK","BREAK") cells.
"""
import zipfile
from xml.sax.saxutils import escape


def col_letter(c):
    """1-based column index → A, B, …, Z, AA…"""
    s = ""
    while c > 0:
        c, r = divmod(c - 1, 26)
        s = chr(65 + r) + s
    return s


def ref(r, c):
    return f"{col_letter(c)}{r}"


class Sheet:
    def __init__(self, name):
        self.name = name
        self.cells = {}  # (r, c) -> ("n", value) | ("s", text) | ("f", formula)

    def n(self, r, c, v):
        self.cells[(r, c)] = ("n", v)

    def s(self, r, c, text):
        self.cells[(r, c)] = ("s", text)

    def f(self, r, c, formula):
        self.cells[(r, c)] = ("f", formula)

    def xml(self):
        by_row = {}
        for (r, c), (kind, payload) in self.cells.items():
            by_row.setdefault(r, []).append((c, kind, payload))
        rows_xml = []
        for r in sorted(by_row):
            cells = []
            for c, kind, payload in sorted(by_row[r]):
                a = f' r="{ref(r, c)}"'
                if kind == "s":
                    cells.append(f'<c{a} t="inlineStr"><is><t>{escape(str(payload))}</t></is></c>')
                elif kind == "f":
                    cells.append(f"<c{a}><f>{escape(str(payload))}</f></c>")
                else:
                    cells.append(f'<c{a}><v>{repr(float(payload))}</v></c>')
            rows_xml.append(f'<row r="{r}">{"".join(cells)}</row>')
        body = "".join(rows_xml)
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f"<sheetData>{body}</sheetData></worksheet>"
        )


def write_workbook(path, hist, plan, year_plan, a, su, ops, sched, expected):
    years = [op["year"] for op in ops]
    yc = {y: 3 + i for i, y in enumerate(years)}      # Operating_Model / Debt_Schedule year cols C..G
    yc_g = lambda y: col_letter(yc[y])

    # ── Assumptions (named ranges on the C-column values) ────────────────────
    asm = Sheet("Assumptions")
    names = {}

    def assumption(r, label, value, name=None, formula=False):
        asm.s(r, 2, label)
        if formula:
            asm.f(r, 3, value)
        else:
            asm.n(r, 3, value)
        if name:
            names[name] = f"Assumptions!$C${r}"

    asm.s(3, 2, "TRANSACTION")
    assumption(4, "Entry multiple (x LTM EBITDA)", a["entry_multiple"], "entry_multiple")
    assumption(5, "Exit multiple (x exit EBITDA)", a["exit_multiple"], "exit_multiple")
    assumption(6, "Hold period (years)", a["hold_years"], "hold_years")
    asm.s(9, 2, "FINANCING")
    assumption(10, "Term Loan B turns (x LTM EBITDA)", a["tlb_turns"], "tlb_turns")
    assumption(11, "Revolver capacity", a["revolver_capacity"], "revolver_capacity")
    assumption(12, "Revolver margin", a["revolver_rate"], "revolver_rate")
    assumption(13, "Revolver commitment fee (undrawn)", a["commitment_fee"], "commitment_fee")
    assumption(14, "TLB margin", a["tlb_rate"], "tlb_rate")
    assumption(15, "TLB mandatory amortisation (% of original)", a["tlb_amort_pct"], "tlb_amort_pct")
    assumption(16, "Excess-cash sweep share", a["cash_sweep_pct"], "cash_sweep_pct")
    assumption(17, "Mezzanine turns (x LTM EBITDA)", a["mezz_turns"], "mezz_turns")
    assumption(18, "Mezzanine cash coupon", a["mezz_cash_rate"], "mezz_cash_rate")
    assumption(19, "Mezzanine PIK accrual", a["mezz_pik_rate"], "mezz_pik_rate")
    asm.s(21, 2, "EXISTING BALANCE SHEET")
    assumption(22, "Existing debt (repaid at close)", a["existing_debt"], "existing_debt")
    assumption(23, "Existing cash", a["existing_cash"], "existing_cash")
    assumption(24, "Minimum cash", a["min_cash"], "min_cash")
    asm.s(26, 2, "FEES")
    assumption(27, "Transaction fees (% of EV)", a["txn_fee_pct"], "txn_fee_pct")
    assumption(28, "Financing fees (% of funded debt)", a["fin_fee_pct"], "fin_fee_pct")
    asm.s(30, 2, "OPERATING")
    assumption(31, "Tax rate", a["tax_rate"], "tax_rate")
    assumption(32, "D&A (% of revenue)", a["da_pct"], "da_pct")
    assumption(33, "Δ NWC (% of revenue increase)", a["nwc_pct"], "nwc_pct")
    asm.s(35, 2, "RETURNS")
    assumption(36, "Hurdle IRR", a["hurdle_irr"], "hurdle_irr")

    # ── Operating_Model (years across columns; the canonical layout) ─────────
    om = Sheet("Operating_Model")
    om.s(2, 1, "Operating model (EUR m)")
    om.s(2, 2, "FY2026 (LTM)")
    for y in years:
        om.s(2, yc[y], f"FY{y}")
    seg_rows = {}
    for i, h in enumerate(hist):
        rb = 4 + i * 3
        seg_rows[h["segment"]] = {"base": rb, "growth": rb + 1, "revenue": rb + 2}
        om.s(rb, 2, f'{h["segment"].capitalize()} revenue')
        om.n(rb, 3, h["fy2026"])
        om.s(rb + 1, 2, "  growth %")
        om.s(rb + 2, 2, "  revenue")
        om.f(rb + 2, 3, f"=C{rb}")
        for y in years:
            om.n(rb + 1, yc[y], plan[(h["segment"], y)]["growth"])
            c, g = yc_g(y), f"{col_letter(yc[y] - 1)}{rb + 2}"
            if y == years[0]:
                om.f(rb + 2, yc[y], f"=$C${rb}*(1+{c}{rb + 1})")
            else:
                om.f(rb + 2, yc[y], f"={g}*(1+{c}{rb + 1})")
    R_REV, R_MARGIN0, R_EBITDA = 14, 16, 19
    om.s(R_REV, 2, "Total revenue")
    om.f(R_REV, 3, "=B6+B9+B12")
    om.s(R_MARGIN0 - 1, 2, "EBITDA margins")
    for i, h in enumerate(hist):
        mr = R_MARGIN0 + i
        om.s(mr, 2, f'  {h["segment"]} margin')
        om.n(mr, 3, h["margin_fy2026"])
        for y in years:
            om.n(mr, yc[y], plan[(h["segment"], y)]["margin"])
    om.s(R_EBITDA, 2, "Total EBITDA")
    om.f(R_EBITDA, 3, "=B6*$B$16+B9*$B$17+B12*$B$18")
    for y in years:
        c = yc_g(y)
        om.f(R_REV, yc[y], f"={c}6+{c}9+{c}12")
        om.f(R_EBITDA, yc[y], f"={c}6*{c}16+{c}9*{c}17+{c}12*{c}18")
    om.s(21, 2, "D&A")
    om.s(22, 2, "EBIT (pre-interest)")
    om.s(23, 2, "Capex % of revenue")
    om.s(24, 2, "Capex")
    om.s(25, 2, "Δ NWC")
    for y in years:
        c = yc_g(y)
        om.f(21, yc[y], f"=da_pct*{c}{R_REV}")
        om.f(22, yc[y], f"={c}{R_EBITDA}-{c}21")
        om.n(23, yc[y], year_plan[years.index(y)]["capex_pct"])
        om.f(24, yc[y], f"={c}23*{c}{R_REV}")
        prev = col_letter(yc[y] - 1)
        om.f(25, yc[y], f"=nwc_pct*({c}{R_REV}-{prev}{R_REV})")

    # ── Sources_Uses ──────────────────────────────────────────────────────────
    su_sh = Sheet("Sources_Uses")
    su_sh.s(2, 1, "Sources & uses at close (EUR m)")
    su_sh.f(3, 3, "=entry_multiple*Operating_Model!$B$19"); su_sh.s(3, 2, "Entry EV")
    su_sh.f(4, 3, "=C3-existing_debt+existing_cash"); su_sh.s(4, 2, "Purchase equity value")
    names["ltm_ebitda"] = "Operating_Model!$B$19"
    su_sh.s(9, 2, "USES")
    su_sh.f(10, 3, "=C4"); su_sh.s(10, 2, "  Purchase of equity")
    su_sh.f(11, 3, "=existing_debt"); su_sh.s(11, 2, "  Repay existing debt")
    su_sh.f(12, 3, "=txn_fee_pct*C3"); su_sh.s(12, 2, "  Transaction fees")
    su_sh.f(13, 3, "=fin_fee_pct*(C17+C18)"); su_sh.s(13, 2, "  Financing fees")
    su_sh.f(14, 3, "=SUM(C10:C13)"); su_sh.s(14, 2, "Total uses")
    su_sh.s(16, 2, "SOURCES")
    su_sh.f(17, 3, "=tlb_turns*Operating_Model!$B$19"); su_sh.s(17, 2, "  Term Loan B")
    su_sh.f(18, 3, "=mezz_turns*Operating_Model!$B$19"); su_sh.s(18, 2, "  Mezzanine")
    su_sh.f(19, 3, "=existing_cash-min_cash"); su_sh.s(19, 2, "  Balance-sheet cash used")
    su_sh.f(20, 3, "=C14-SUM(C17:C19)"); su_sh.s(20, 2, "  Sponsor equity (plug)")
    su_sh.f(21, 3, "=SUM(C17:C20)"); su_sh.s(21, 2, "Total sources")
    su_sh.f(23, 3, '=IF(ABS(C21-C14)<0.01,"OK","BREAK")'); su_sh.s(23, 2, "CHECK sources = uses")

    # ── Debt_Schedule (and the circular average-balance variant) ─────────────
    def debt_sheet(name, avg):
        ds = Sheet(name)
        ds.s(2, 1, f"Debt schedule (EUR m){' — average-balance interest (ITERATIVE/CIRCULAR)' if avg else ''}")
        ds.s(2, 2, "At close")
        for y in years:
            ds.s(2, yc[y], f"FY{y}")
        ds.s(5, 2, "Term loan B")
        ds.s(6, 2, "  Beginning")
        ds.s(7, 2, "  Interest")
        ds.s(8, 2, "  Mandatory amortisation")
        ds.s(9, 2, "  Cash sweep")
        ds.s(10, 2, "  Ending")
        ds.s(12, 2, "Mezzanine")
        ds.s(13, 2, "  Beginning")
        ds.s(14, 2, "  Cash interest")
        ds.s(15, 2, "  PIK accrual")
        ds.s(16, 2, "  Ending")
        ds.s(18, 2, "Revolver")
        ds.s(19, 2, "  Beginning")
        ds.s(20, 2, "  Interest")
        ds.s(21, 2, "  Commitment fee (undrawn)")
        ds.s(22, 2, "  Repayment")
        ds.s(23, 2, "  Draw (deficit)")
        ds.s(24, 2, "  Draw (top-up after amort)")
        ds.s(25, 2, "  Ending")
        ds.s(27, 2, "Cash flow")
        ds.s(28, 2, "  Total cash interest")
        ds.s(29, 2, "  EBT")
        ds.s(30, 2, "  Taxes")
        ds.s(31, 2, "  Net income")
        ds.s(35, 2, "  CFADR")
        ds.s(36, 2, "  Residual (post revolver + amort)")
        ds.s(38, 2, "  Retained to cash")
        ds.s(40, 2, "Cash — beginning")
        ds.s(41, 2, "Cash — ending")
        ds.s(43, 2, "Credit stats")
        ds.s(44, 2, "  Net debt")
        ds.s(45, 2, "  Leverage (x)")
        ds.s(46, 2, "  Coverage (x)")
        ds.f(6, 2, "=Sources_Uses!C17")
        ds.f(13, 2, "=Sources_Uses!C18")
        ds.n(19, 2, 0.0)
        ds.f(40, 2, "=min_cash")  # beginning cash at close
        for i, y in enumerate(years):
            c = yc_g(y)
            p = col_letter(yc[y] - 1)
            ds.f(2, yc[y], f"=Operating_Model!{c}{R_EBITDA}")
            ds.f(3, yc[y], f"=Operating_Model!{c}21")
            # TLB
            ds.f(6, yc[y], f"=B6" if y == years[0] else f"={p}10")
            if avg:
                ds.f(7, yc[y], f"=tlb_rate*({c}6+{c}10)/2")
            else:
                ds.f(7, yc[y], f"=tlb_rate*{c}6")
            ds.f(8, yc[y], f"=MIN(tlb_amort_pct*Sources_Uses!$C$17,{c}6)")
            ds.f(9, yc[y], f"=MIN(cash_sweep_pct*MAX(0,{c}35-{c}8),{c}6-{c}8)")
            ds.f(10, yc[y], f"={c}6-{c}8-{c}9")
            # Mezzanine
            ds.f(13, yc[y], "=B13" if y == years[0] else f"={p}16")
            if avg:
                ds.f(14, yc[y], f"=mezz_cash_rate*({c}13+{c}16)/2")
            else:
                ds.f(14, yc[y], f"=mezz_cash_rate*{c}13")
            ds.f(15, yc[y], f"={c}13*mezz_pik_rate")
            ds.f(16, yc[y], f"={c}13+{c}15")
            # Revolver
            ds.f(19, yc[y], "=B19" if y == years[0] else f"={p}25")
            if avg:
                ds.f(20, yc[y], f"=revolver_rate*({c}19+{c}25)/2")
                ds.f(21, yc[y], f"=commitment_fee*MAX(0,(revolver_capacity-{c}19+revolver_capacity-{c}25)/2)")
            else:
                ds.f(20, yc[y], f"=revolver_rate*{c}19")
                ds.f(21, yc[y], f"=commitment_fee*MAX(0,revolver_capacity-{c}19)")
            ds.f(22, yc[y], f"=MIN({c}19,MAX(0,{c}35))")
            ds.f(23, yc[y], f"=MIN(MAX(0,revolver_capacity-{c}19),MAX(0,-{c}35))")
            ds.f(24, yc[y], f"=MIN(MAX(0,revolver_capacity-({c}19+{c}23)),MAX(0,-({c}35-{c}22+{c}23-{c}8)))")
            ds.f(25, yc[y], f"={c}19+{c}23+{c}24-{c}22")
            # Cash flow
            ds.f(28, yc[y], f"={c}7+{c}14+{c}20+{c}21")
            ds.f(29, yc[y], f"={c}2-{c}3-{c}28")
            ds.f(30, yc[y], f"=MAX(0,{c}29*tax_rate)")
            ds.f(31, yc[y], f"={c}29-{c}30")
            ds.f(35, yc[y], f"={c}31+{c}3-Operating_Model!{c}24-Operating_Model!{c}25")
            ds.f(36, yc[y], f"={c}35-{c}22+{c}23+{c}24-{c}8")
            ds.f(38, yc[y], f"={c}36-{c}9")
            # Cash
            ds.f(40, yc[y], "=B40" if y == years[0] else f"={p}41")
            ds.f(41, yc[y], f"={c}40+{c}38")
            # Credit stats
            ds.f(44, yc[y], f"={c}10+{c}16+{c}25-{c}41")
            ds.f(45, yc[y], f"={c}44/{c}2")
            ds.f(46, yc[y], f"={c}2/{c}28")
        return ds

    ds = debt_sheet("Debt_Schedule", avg=False)
    dsa = debt_sheet("Debt_Schedule_Avg", avg=True)

    # ── Sens_Models (one 5-year TLB block per leverage case; no data tables) ──
    sm = Sheet("Sens_Models")
    sm.s(2, 1, "Sensitivity engine: full model re-run per TLB leverage case (no data table)")
    leverage_cases = [4.0, 4.5, 5.0, 5.5, 6.0]
    block = {}
    for k, lev in enumerate(leverage_cases):
        R = 4 + k * 15
        block[lev] = R
        sm.s(R, 2, f"Leverage case {lev}x TLB")
        sm.n(R + 1, 2, lev)
        sm.s(R + 1, 3, "TLB at close")
        sm.f(R + 2, 2,
             f"=(Sources_Uses!$C$10+Sources_Uses!$C$11+Sources_Uses!$C$12"
             f"+fin_fee_pct*(B{R + 1}+Sources_Uses!$C$18))-B{R + 1}-Sources_Uses!$C$18-Sources_Uses!$C$19")
        sm.s(R + 2, 3, "Sponsor equity")
        sm.s(R + 3, 2, "year →")
        for y in years:
            sm.s(R + 3, yc[y], f"FY{y}")
        sm.s(R + 4, 2, "  TLB beginning")
        sm.s(R + 5, 2, "  Cash interest")
        sm.s(R + 6, 2, "  CFADR")
        sm.s(R + 7, 2, "  Mandatory")
        sm.s(R + 8, 2, "  Sweep")
        sm.s(R + 9, 2, "  Retained")
        sm.s(R + 10, 2, "  TLB ending")
        sm.s(R + 11, 2, "  Cash ending")
        sm.s(R + 12, 2, "  Mezzanine at exit")
        sm.s(R + 13, 2, "  Net debt at exit")
        for y in years:
            c = yc_g(y)
            p = col_letter(yc[y] - 1)
            sm.f(R + 4, yc[y], f"=$B${R + 1}" if y == years[0] else f"={p}{R + 10}")
            sm.f(R + 5, yc[y],
                 f"=tlb_rate*{c}{R + 4}+mezz_cash_rate*Sources_Uses!$C$18+commitment_fee*revolver_capacity")
            sm.f(R + 6, yc[y],
                 f"=(Operating_Model!{c}${R_EBITDA}-Operating_Model!{c}$21-{c}{R + 5})*(1-tax_rate)"
                 f"+Operating_Model!{c}$21-Operating_Model!{c}$24-Operating_Model!{c}$25")
            sm.f(R + 7, yc[y], f"=MIN(tlb_amort_pct*$B${R + 1},{c}{R + 4})")
            sm.f(R + 8, yc[y], f"=MIN(cash_sweep_pct*MAX(0,{c}{R + 6}-{c}{R + 7}),{c}{R + 4}-{c}{R + 7})")
            sm.f(R + 9, yc[y], f"={c}{R + 6}-{c}{R + 7}-{c}{R + 8}")
            sm.f(R + 10, yc[y], f"={c}{R + 4}-{c}{R + 7}-{c}{R + 8}")
        g = yc_g(years[-1])
        sm.f(R + 11, 3, f"=min_cash+SUM(C{R + 9}:{g}{R + 9})")
        sm.f(R + 12, 3, f"=Sources_Uses!$C$18*(1+mezz_pik_rate)^hold_years")
        sm.f(R + 13, 3, f"={g}{R + 10}+C{R + 12}-C{R + 11}")

    # ── Returns ───────────────────────────────────────────────────────────────
    ret = Sheet("Returns")
    ret.s(2, 1, "Returns (EUR m)")
    ret.f(3, 3, f"=Debt_Schedule!{yc_g(years[-1])}2"); ret.s(3, 2, "Exit-year EBITDA")
    ret.f(4, 3, "=exit_multiple"); ret.s(4, 2, "Exit multiple")
    ret.f(5, 3, "=C3*C4"); ret.s(5, 2, "Exit EV")
    ret.f(6, 3, f"=Debt_Schedule!{yc_g(years[-1])}44"); ret.s(6, 2, "Net debt at exit")
    ret.f(7, 3, "=C5-C6"); ret.s(7, 2, "Exit equity to sponsor")
    ret.f(8, 3, "=Sources_Uses!C20"); ret.s(8, 2, "Sponsor equity at entry")
    ret.f(9, 3, "=C7/C8"); ret.s(9, 2, "MOIC (x)")
    ret.s(11, 2, "Sponsor cash flows")
    ret.f(12, 2, "=-C8")
    for i in range(1, 5):
        ret.n(12, 2 + i, 0.0)
    ret.f(12, 7, "=C7")
    ret.f(13, 3, "=IRR(B12:G12)"); ret.s(13, 2, "Sponsor IRR")
    ret.f(14, 2, "=-C8")
    for i in range(1, 5):
        ret.n(14, 2 + i, 0.0)
    ret.f(14, 7, f"=C5-Debt_Schedule_Avg!{yc_g(years[-1])}44")
    ret.f(15, 3, "=IRR(B14:G14)"); ret.s(15, 2, "Sponsor IRR (avg-balance interest)")
    ret.n(16, 3, expected["breakeven_exit_multiple"])
    ret.s(16, 2, "Breakeven exit multiple (goal seek: IRR = hurdle)")
    ret.s(16, 4, "← static value; in Excel: Data → What-If Analysis → Goal Seek")
    ret.s(18, 1, "Sensitivity: sponsor IRR by exit multiple (rows) × TLB leverage (columns)")
    ret.s(18, 2, "exit multiple ↓ / TLB turns →")
    for k, lev in enumerate(leverage_cases):
        ret.n(19, 3 + k, lev)
    exit_mults = [7.0, 7.5, 8.0, 8.5, 9.0]
    for i, m in enumerate(exit_mults):
        r = 20 + i
        ret.n(r, 2, m)
        for k, lev in enumerate(leverage_cases):
            R = block[lev]
            ret.f(r, 3 + k,
                  f"=POWER(($B{r}*$C$3-Sens_Models!$C${R + 13})/Sens_Models!$B${R + 2},1/hold_years)-1")
    ret.s(26, 1, "Base case (8.0x / 5.0x) must equal C13 — the hand-rolled grid's own check")

    # ── Checks (the Excel answer to Reckoner test cells) ─────────────────────
    ch = Sheet("Checks")
    ch.s(2, 1, "Model checks — the IF(...,\"OK\",\"BREAK\") convention")
    ch.f(3, 2, '=IF(ABS(Sources_Uses!C21-Sources_Uses!C14)<0.01,"OK","BREAK")')
    ch.s(3, 1, "Sources = uses")
    for i, y in enumerate(years):
        c = yc_g(y)
        ch.f(4, 3 + i, f'=IF(ABS(Debt_Schedule!{c}10-(Debt_Schedule!{c}6-Debt_Schedule!{c}8-Debt_Schedule!{c}9))<0.005,"OK","BREAK")')
        ch.f(5, 3 + i, f'=IF(ABS(Debt_Schedule!{c}16-(Debt_Schedule!{c}13+Debt_Schedule!{c}15))<0.005,"OK","BREAK")')
        ch.f(6, 3 + i, f'=IF(ABS(Debt_Schedule!{c}25-(Debt_Schedule!{c}19+Debt_Schedule!{c}23+Debt_Schedule!{c}24-Debt_Schedule!{c}22))<0.005,"OK","BREAK")')
        ch.f(7, 3 + i, f'=IF(ABS(Debt_Schedule!{c}41-(Debt_Schedule!{c}40+Debt_Schedule!{c}38))<0.005,"OK","BREAK")')
    ch.s(4, 1, "TLB roll-forward")
    ch.s(5, 1, "Mezzanine roll-forward (PIK)")
    ch.s(6, 1, "Revolver roll-forward")
    ch.s(7, 1, "Cash roll-forward")
    ch.f(8, 2, f'=IF(MAX(Debt_Schedule!C45:{yc_g(years[-1])}45)<={expected["covenants"]["leverage_threshold"]},"OK","BREACH")')
    ch.s(8, 1, "Leverage covenant")
    ch.f(9, 2, f'=IF(MIN(Debt_Schedule!C46:{yc_g(years[-1])}46)>={expected["covenants"]["coverage_threshold"]},"OK","BREACH")')
    ch.s(9, 1, "Coverage covenant")
    ch.f(10, 2, f'=IF(MIN(Debt_Schedule!C41:{yc_g(years[-1])}41)>=min_cash,"OK","BREACH")')
    ch.s(10, 1, "Liquidity: cash ≥ minimum")
    ch.f(11, 2, '=IF(Returns!C13>=hurdle_irr,"PASS","FAIL")')
    ch.s(11, 1, "Base IRR ≥ hurdle")

    sheets = [asm, om, su_sh, ds, dsa, sm, ret, ch]
    _write_zip(path, sheets, names)


def _write_zip(path, sheets, names):
    n = len(sheets)
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + "".join(
            f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" '
            f'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for i in range(n)
        )
        + "</Types>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    sheet_tags = "".join(
        f'<sheet name="{escape(s.name)}" sheetId="{i + 1}" r:id="rId{i + 1}"/>'
        for i, s in enumerate(sheets)
    )
    defined = "".join(
        f'<definedName name="{escape(name)}">{escape(target)}</definedName>'
        for name, target in sorted(names.items())
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{sheet_tags}</sheets>"
        f"<definedNames>{defined}</definedNames>"
        '<calcPr calcId="171027" fullCalcOnLoad="1" iterate="1" iterateCount="200" iterateDelta="0.0000001"/>'
        "</workbook>"
    )
    wb_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(
            f'<Relationship Id="rId{i + 1}" '
            f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{i + 1}.xml"/>'
            for i in range(n)
        )
        + "</Relationships>"
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        # fixed timestamp (the zip epoch) so output is byte-deterministic across runs
        def put(name, text):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            z.writestr(info, text)

        put("[Content_Types].xml", content_types)
        put("_rels/.rels", root_rels)
        put("xl/workbook.xml", workbook)
        put("xl/_rels/workbook.xml.rels", wb_rels)
        for i, s in enumerate(sheets):
            put(f"xl/worksheets/sheet{i + 1}.xml", s.xml())
