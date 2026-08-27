// fixpoint (R3-378): the explicit converged-calculation helper. The contract that
// matters: convergence is RETURNED as evidence, non-convergence is visible
// (converged: false — never a silently-wrong value), a throwing step propagates,
// and a degenerate budget is an authoring error.

import { describe, it, expect } from 'vitest';
import { fixpoint } from './fixpoint.ts';

describe('fixpoint', () => {
  it('converges a contracting step and reports the iteration count', () => {
    // x → (x + 2/x) / 2 — Newton's sqrt(2), ~5 iterations from 1
    const r = fixpoint(1, (x) => ((x as number) + 2 / (x as number)) / 2);
    expect(r.converged).toBe(true);
    expect(r.iterations).toBeGreaterThan(1);
    expect(r.value).toBeCloseTo(Math.SQRT2, 11);
  });

  it('the Caldera shape: a state object with per-leaf numeric convergence', () => {
    // average-balance interest: balance → (open + close)/2 style contraction
    const r = fixpoint(
      { tlb: 100 },
      (s) => ({ tlb: ((s as { tlb: number }).tlb + 80) / 2 }),
    );
    expect(r.converged).toBe(true);
    expect((r.value as { tlb: number }).tlb).toBeCloseTo(80, 10);
  });

  it('an oscillating step returns converged: false at the budget with the last state — visible, not wrong', () => {
    const r = fixpoint(1, (x) => (x as number) === 1 ? 2 : 1, { maxIterations: 50 });
    expect(r.converged).toBe(false);
    expect(r.iterations).toBe(50);
    expect([1, 2]).toContain(r.value);
  });

  it('a diverging step also reports converged: false', () => {
    const r = fixpoint(1, (x) => (x as number) * 3, { maxIterations: 10 });
    expect(r.converged).toBe(false);
    expect(r.value).toBe(3 ** 10);
  });

  it('a throwing step propagates as a visible error', () => {
    expect(() => fixpoint(1, () => { throw new Error('boom'); })).toThrow(/boom/);
  });

  it('maxIterations < 1 throws — a degenerate budget is an authoring error', () => {
    expect(() => fixpoint(1, (x) => x, { maxIterations: 0 })).toThrow(/positive integer/);
    expect(() => fixpoint(1, (x) => x, { maxIterations: 2.5 })).toThrow(/positive integer/);
  });

  it('a step that never moves converges immediately (1 iteration)', () => {
    const r = fixpoint({ a: 1 }, (s) => ({ ...(s as object) }));
    expect(r).toEqual({ converged: true, iterations: 1, value: { a: 1 } });
  });
});
