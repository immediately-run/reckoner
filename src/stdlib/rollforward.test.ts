// rollforward + cumprod (R3-375, gap G5 — the multi-state roll-forward primitive the
// Caldera debt schedule needed). The roll-forward is THE financial-modeling structure:
// co-evolving balances, each row's close becoming the next row's open. These unit tests
// pin the semantics the case study's port-forward relies on: begin/end columns, state
// chaining, orderBy, sanitization, and the degenerate cases.

import { describe, it, expect } from 'vitest';
import { rollforward, cumprod, scan } from './ordered.ts';
import type { Row } from './types.ts';

describe('cumprod', () => {
  it('compounds the finite values and carries across nulls, like cumsum', () => {
    const rows: Row[] = [
      { period: 1, f: 1.08 },
      { period: 2, f: null },
      { period: 3, f: 1.07 },
    ];
    const out = scan(rows, { path: cumprod('f') }, { orderBy: 'period' });
    expect(out.map((r) => r.path)).toEqual([1.08, 1.08, 1.1556000000000001]);
  });

  it('null until the first finite value', () => {
    const rows: Row[] = [
      { period: 1, f: null },
      { period: 2, f: 2 },
    ];
    expect(scan(rows, { path: cumprod('f') }, { orderBy: 'period' }).map((r) => r.path)).toEqual([null, 2]);
  });

  it('empty rows → empty out', () => {
    expect(scan([], { path: cumprod('f') }, { orderBy: 'period' })).toEqual([]);
  });
});

describe('rollforward', () => {
  it('chains multi-state balances: each close is the next open, begin/end columns flattened', () => {
    const years: Row[] = [
      { year: 2028, amort: 2 },
      { year: 2027, amort: 2 }, // deliberately unordered: orderBy must sort first
    ];
    const out = rollforward(years, {
      orderBy: 'year',
      begin: { tlb: 100, cash: 10 },
      step: (row, bal) => {
        const sweep = 0.5 * ((bal.cash as number) + 1);
        return {
          out: { sweep, cfadr: (bal.cash as number) + 1 },
          next: { tlb: (bal.tlb as number) - (row.amort as number) - sweep, cash: (bal.cash as number) + 1 - sweep },
        };
      },
    });
    expect(out.map((r) => r.year)).toEqual([2027, 2028]);
    // 2027: open (100, 10) → cfadr 11, sweep 5.5 → close (92.5, 5.5)
    expect(out[0].tlb_begin).toBe(100);
    expect(out[0].cash_begin).toBe(10);
    expect(out[0].tlb_end).toBe(92.5);
    expect(out[0].cash_end).toBe(5.5);
    expect(out[0].sweep).toBe(5.5);
    // 2028 opens at 2027's close: cash 5.5 → cfadr 6.5, sweep 3.25 → tlb 92.5 − 2 − 3.25
    expect(out[1].tlb_begin).toBe(92.5);
    expect(out[1].cash_begin).toBe(5.5);
    expect(out[1].tlb_end).toBeCloseTo(87.25, 12);
    expect(out[1].cash_end).toBeCloseTo(3.25, 12);
  });

  it('one row: begin comes from the options, end from the step', () => {
    const out = rollforward([{ year: 2027 }], {
      orderBy: 'year',
      begin: { bal: 5 },
      step: (_row, bal) => ({ out: { interest: (bal.bal as number) * 0.1 }, next: { bal: (bal.bal as number) * 1.1 } }),
    });
    expect(out).toEqual([{ year: 2027, bal_begin: 5, interest: 0.5, bal_end: 5.5 }]);
  });

  it('empty rows → empty out (no step ever runs)', () => {
    expect(
      rollforward([], {
        orderBy: 'year',
        begin: { bal: 1 },
        step: () => {
          throw new Error('must not run');
        },
      }),
    ).toEqual([]);
  });

  it('sanitizes non-finite state and outputs to null (DSL-6), never silent NaN', () => {
    const out = rollforward([{ year: 2027, f: 0 }], {
      orderBy: 'year',
      begin: { bal: 1 },
      step: (row, bal) => ({ out: { ratio: 1 / (row.f as number) }, next: { bal: (bal.bal as number) / (row.f as number) } }),
    });
    expect(out[0].ratio).toBe(null);
    expect(out[0].bal_end).toBe(null);
  });

  it('a step returning no `out` still yields begin/end columns', () => {
    const out = rollforward([{ year: 2027 }], {
      orderBy: 'year',
      begin: { n: 3 },
      step: (_row, bal) => ({ next: { n: (bal.n as number) - 1 } }),
    });
    expect(out).toEqual([{ year: 2027, n_begin: 3, n_end: 2 }]);
  });

  it('a missing key in next degrades to null on the end column and null on the next begin — visible, not invented', () => {
    const rows: Row[] = [{ year: 2027 }, { year: 2028 }];
    const out = rollforward(rows, {
      orderBy: 'year',
      begin: { a: 1, b: 2 },
      step: (_row, bal) => ({ next: { a: (bal.a as number) + 1 } }), // forgot `b`
    });
    expect(out[0].b_end).toBe(null);
    expect(out[1].b_begin).toBe(null);
  });
});
