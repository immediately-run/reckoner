import { describe, it, expect } from 'vitest';
import {
  conservation,
  permutationInvariance,
  scaleInvariance,
  property,
} from './relations.ts';
import type { Value } from './types.ts';

describe('conservation (row reconciliation — the MRR waterfall)', () => {
  const rel = conservation({
    components: ['start', 'new', 'churned', 'end_neg'],
    equals: 'end',
  });

  it('passes when every row reconciles', () => {
    // end = start + new + churned + end_neg is contrived; use a real identity:
    const rel2 = conservation({ components: ['start', 'movement'], equals: 'end' });
    const result: Value = [
      { start: 1000, movement: 160, end: 1160 },
      { start: 1160, movement: -20, end: 1140 },
    ];
    expect(rel2.evaluate({ result }).pass).toBe(true);
  });

  it('fails a row that does not reconcile, naming the row', () => {
    const result: Value = [{ start: 1, new: 1, churned: 0, end_neg: 0, end: 3 }]; // sums to 2, not 3
    const r = rel.evaluate({ result });
    expect(r.pass).toBe(false);
    expect(r.message).toContain('row 0');
  });

  it('respects tolerance', () => {
    const rel3 = conservation({ components: ['a'], equals: 'b', tol: { abs: 0.01 } });
    expect(rel3.evaluate({ result: [{ a: 1.0, b: 1.005 }] }).pass).toBe(true);
    expect(rel3.evaluate({ result: [{ a: 1.0, b: 1.05 }] }).pass).toBe(false);
  });

  it('fails when the result is not an array of rows', () => {
    expect(conservation({ components: ['a'], equals: 'b' }).evaluate({ result: 5 }).pass).toBe(false);
  });
});

describe('permutationInvariance', () => {
  const rel = permutationInvariance({ over: 'orders' });

  it('targets the right input and reverses it (a permutation)', () => {
    expect(rel.inputToTransform).toBe('orders');
    expect(rel.transform?.([1, 2, 3])).toEqual([3, 2, 1]);
  });

  it('passes when the two results match, fails when they differ', () => {
    const out: Value = [{ month: 'jan', total: 10 }];
    expect(rel.evaluate({ result: out, transformedResult: [{ month: 'jan', total: 10 }] }).pass).toBe(true);
    expect(rel.evaluate({ result: out, transformedResult: [{ month: 'jan', total: 11 }] }).pass).toBe(false);
  });

  it('fails when the runner did not supply a transformed result', () => {
    expect(rel.evaluate({ result: [] }).pass).toBe(false);
  });

  // R3-374: reordering float summation legitimately moves results by ulps — an
  // order-invariance check must not compare bit-for-bit. (0.1+0.2)+0.3 vs
  // (0.3+0.2)+0.1 differ; strict deepEqual fails, the tolerant default passes.
  it('passes a last-ulp reorder difference that strict deepEqual would fail', () => {
    const fwd = 0.1 + 0.2 + 0.3; // 0.6000000000000001
    const rev = 0.3 + 0.2 + 0.1; // 0.6
    expect(Object.is(fwd, rev)).toBe(false); // the test bites: they really differ
    expect(rel.evaluate({ result: [{ total: fwd }], transformedResult: [{ total: rev }] }).pass).toBe(true);
  });

  it('still fails on a real numeric difference beyond the tolerance', () => {
    expect(rel.evaluate({ result: [{ total: 0.6 }], transformedResult: [{ total: 0.600001 }] }).pass).toBe(false);
  });
});

describe('scaleInvariance', () => {
  const rel = scaleInvariance({ over: 'orders', by: 2 });

  it('scales the numeric leaves of the transformed input', () => {
    expect(rel.transform?.([{ amount: 5 }, { amount: 3 }])).toEqual([{ amount: 10 }, { amount: 6 }]);
  });

  it('passes when every result leaf scales by the factor', () => {
    const base: Value = [{ region: 'EU', revenue: 100 }];
    const scaled: Value = [{ region: 'EU', revenue: 200 }];
    expect(rel.evaluate({ result: base, transformedResult: scaled }).pass).toBe(true);
  });

  it('fails when a leaf does not scale, or non-numeric structure changed', () => {
    const base: Value = [{ region: 'EU', revenue: 100 }];
    expect(rel.evaluate({ result: base, transformedResult: [{ region: 'EU', revenue: 150 }] }).pass).toBe(false);
    expect(rel.evaluate({ result: base, transformedResult: [{ region: 'US', revenue: 200 }] }).pass).toBe(false);
  });

  // R3-374: `leaves` names the only fields that scale — the escape for inputs that
  // also carry rates/percentages (the Caldera historical_segments shape: revenue
  // scales, margins must not).
  it('leaves: only the named input fields scale; everything else must be unchanged', () => {
    const sel = scaleInvariance({ over: 'hist', by: 2, leaves: ['fy2026'] });
    const hist: Value = [
      { segment: 'seals', fy2026: 96, margin_fy2026: 0.26 },
      { segment: 'bearings', fy2026: 74, margin_fy2026: 0.19 },
    ];
    expect(sel.transform?.(hist)).toEqual([
      { segment: 'seals', fy2026: 192, margin_fy2026: 0.26 },
      { segment: 'bearings', fy2026: 148, margin_fy2026: 0.19 },
    ]);
    // a linear subject over the selected leaves: ltm ebitda = Σ fy2026 × margin
    type H = { fy2026: number; margin_fy2026: number };
    const ltm = (rows: unknown): Value =>
      (rows as H[]).reduce((a, r) => a + r.fy2026 * r.margin_fy2026, 0);
    expect(
      sel.evaluate({ result: ltm(hist), transformedResult: ltm(sel.transform!(hist)) }).pass,
    ).toBe(true);
    // and a margin that moved is caught: the unselected leaves must be unchanged
    expect(
      sel.evaluate({
        result: ltm(hist),
        transformedResult: ltm(hist.map((r) => ({ ...(r as object), margin_fy2026: 0.5 }))),
      }).pass,
    ).toBe(false);
  });
});

describe('property', () => {
  it('wraps a boolean predicate', () => {
    const rel = property('retention never exceeds 1', (result) =>
      (result as { pct: number }[]).every((r) => r.pct <= 1),
    );
    expect(rel.evaluate({ result: [{ pct: 0.9 }, { pct: 1 }] }).pass).toBe(true);
    expect(rel.evaluate({ result: [{ pct: 1.2 }] }).pass).toBe(false);
  });

  it('passes inputs through and accepts a TestResult return', () => {
    const rel = property('uses inputs', (_result, inputs) => ({
      pass: inputs.n === 3,
      message: 'checked n',
    }));
    expect(rel.evaluate({ result: null, inputs: { n: 3 } }).pass).toBe(true);
  });
});
