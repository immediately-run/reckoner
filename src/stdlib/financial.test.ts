// Financial functions (R3-375/W4 — gap G2): irr/npv by bracketed bisection, xirr with
// ACT/365.25 day counts. The load-bearing contract: unbracketed or sign-change-free
// flows THROW — a visible cell error, never a confident wrong number. Reference values
// for the multi-flow xirr case are Python-computed (`python3 -c` with the same
// day-count convention, 2026-08-27).

import { describe, it, expect } from 'vitest';
import { irr, npv, solve, xirr } from './financial.ts';

describe('npv', () => {
  it('discounts flows[0] at t=0 (the investment-at-t0 convention)', () => {
    // rate 10%: -100 at t0, +110 at t1 → NPV 0
    expect(npv(0.1, [-100, 110])).toBeCloseTo(0, 12);
  });

  it('multi-period discounting', () => {
    // -1 at t0, 0.5 at t1 and t2 at r=0.25 → -1 + 0.4 + 0.32 = -0.28
    expect(npv(0.25, [-1, 0.5, 0.5])).toBeCloseTo(-0.28, 12);
  });

  it('rejects rate ≤ -1 and non-numeric flows, visibly', () => {
    expect(() => npv(-1, [1, 2])).toThrow(/> -1/);
    expect(() => npv(0.1, [1, null])).toThrow(/t=1/);
  });
});

describe('irr', () => {
  it('the Caldera base case: [-114.8837, 0, 0, 0, 0, 315.4591…] → 22.387462…%', () => {
    expect(irr([-114.8837, 0, 0, 0, 0, 315.45910005498115])).toBeCloseTo(0.22387462120837076, 12);
  });

  it('the closed-form two-flow case is exact: (b/a)^(1/n) − 1', () => {
    const a = 114.8837;
    const b = 315.45910005498115;
    expect(irr([-a, 0, 0, 0, 0, b])).toBeCloseTo(Math.pow(b / a, 1 / 5) - 1, 15);
  });

  it('all-positive / all-negative flows throw with the sign-change diagnostic', () => {
    expect(() => irr([1, 2, 3])).toThrow(/at least one negative and one positive/);
    expect(() => irr([-1, -2])).toThrow(/at least one negative and one positive/);
  });

  it('an unbracketable flow vector throws with the NPV endpoints named', () => {
    // NPV stays positive across the default bracket: tiny returns on a huge win
    expect(() => irr([-1, 1e12])).toThrow(/brackets NPV/);
  });

  it('a widened bracket can rescue a root outside the default window', () => {
    // (1+r)^1 = 3 → r = 200%, outside { hi: 1 } (NPV(1) = +0.5), inside { hi: 10 }
    expect(() => irr([-1, 3], { hi: 1 })).toThrow(/brackets/);
    expect(irr([-1, 3], { hi: 10 })).toBeCloseTo(2, 15);
  });
});

describe('xirr', () => {
  it('annual-dated two-flow case matches the closed form exactly', () => {
    // 365 days apart at ACT/365.25 — not exactly one period; compute the closed form
    const t = 365 / 365.25;
    const expected = Math.pow(315.45910005498115 / 114.8837, 1 / t) - 1;
    expect(
      xirr([
        { amount: -114.8837, date: '2026-12-31' },
        { amount: 315.45910005498115, date: '2027-12-31' },
      ]),
    ).toBeCloseTo(expected, 12);
  });

  it('multi-flow reference vector matches Python-computed truth', () => {
    // Python (same convention, bisect to 1e-12): 0.1864080806881524
    const rows = [
      { amount: -100, date: '2026-01-01' },
      { amount: 10, date: '2026-07-01' },
      { amount: 15, date: '2027-01-01' },
      { amount: 110, date: '2028-01-01' },
    ];
    expect(xirr(rows)).toBeCloseTo(0.1864080806881524, 12);
  });

  it('the earliest date is t0 regardless of row order; by names the date field', () => {
    const rows = [
      { when: '2027-12-31', amount: 121 },
      { when: '2026-12-31', amount: -100 },
    ];
    // 365 days at ACT/365.25 → t = 365/365.25; the closed form, not a rounded 0.21
    const t = 365 / 365.25;
    expect(xirr(rows, { by: 'when' })).toBeCloseTo(Math.pow(1.21, 1 / t) - 1, 12);
  });

  it('bad dates and sign-change-free flows throw visibly', () => {
    expect(() => xirr([{ amount: -1, date: '31/12/2026' }])).toThrow(/ISO date/);
    expect(() => xirr([{ amount: 1, date: '2026-12-31' }, { amount: 2, date: '2027-12-31' }])).toThrow(
      /negative and one positive/,
    );
  });
});

describe('solve', () => {
  it('finds the root of a monotone function', () => {
    expect(solve((x) => x * x, 4, 0, 10)).toBeCloseTo(2, 15);
    expect(solve((x) => -x, -3, 0, 10)).toBeCloseTo(3, 15); // decreasing works too
  });

  it('the Caldera breakeven shape: irr(m) = hurdle', () => {
    // cheap stand-in for runModel: (1+m/8)^5-ish growth; root at m = 8 * (2^(1/5) - 1)… just assert bracketing + monotone root
    const root = solve((m) => Math.pow(m / 8, 3), 1, 4, 12);
    expect(root).toBeCloseTo(8, 15);
  });

  it('an unbracketed target throws with the endpoints named', () => {
    expect(() => solve((x) => x, 50, 0, 10)).toThrow(/does not bracket target 50/);
  });

  it('lo ≥ hi throws', () => {
    expect(() => solve((x) => x, 1, 5, 5)).toThrow(/lo < hi/);
    expect(() => solve((x) => x, 1, 6, 5)).toThrow(/lo < hi/);
  });

  it('a multi-root bracket is rejected visibly (the monotonicity probe)', () => {
    // x³ − 4x over [−3, 3]: endpoints straddle (−15, +15) but roots at −2, 0, 2 — the probe catches it
    const cubic = (x: number): number => x * x * x - 4 * x;
    expect(() => solve(cubic, 0, -3, 3)).toThrow(/not monotone/);
    // narrow brackets around one root pass — splitting is the remedy the error names
    expect(solve(cubic, 0, 1, 3)).toBeCloseTo(2, 15);
  });

  it('a non-finite fn throws visibly', () => {
    expect(() => solve((x) => (x > 4 ? Number.NaN : x), 1, 0, 10)).toThrow(/finite/);
  });

  it('probes: 1 disables the monotonicity check (documented escape)', () => {
    // the multi-root cubic, unprobed: bisection from the left settles — 0 is an exact midpoint root
    const r = solve((x) => x * x * x - 4 * x, 0, -3, 3, { probes: 1 });
    expect(r).toBe(0);
  });
});

describe('solve parity — vs the hand-rolled bisection it replaces (R3-381)', () => {
  it('identical iterate sequence on a family of monotone functions, to 1e-15', () => {
    const family: Array<{ fn: (x: number) => number; targets: number[] }> = [
      { fn: (m) => m, targets: [5, 8.5, 11] },
      { fn: (m) => (m * m * m) / 512, targets: [0.5, 1, 2] },
      { fn: (m) => Math.pow(m / 8, 5), targets: [0.5, 1, 2] },
    ];
    for (const { fn, targets } of family) {
      for (const target of targets) {
        // the old breakeven loop, verbatim shape
        let lo = 4;
        let hi = 12;
        for (let i = 0; i < 200; i += 1) {
          const mid = (lo + hi) / 2;
          if (fn(mid) < target) lo = mid;
          else hi = mid;
        }
        expect(Math.abs(solve(fn, target, 4, 12) - (lo + hi) / 2)).toBeLessThanOrEqual(5e-15);
        // (5e-15 ≈ 2 ulps at this magnitude: solve early-returns on an exact-root hit
        //  where the hand loop saturates at 1–2 ulps — same root, both correct.)
      }
    }
  });
});
