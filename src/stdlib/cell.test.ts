import { describe, it, expect } from 'vitest';
import { cell, testCell } from './cell.ts';
import { table } from './table.ts';
import { sum } from './aggregate.ts';
import { permutationInvariance } from './relations.ts';
import { expectClose } from './testing.ts';
import type { Row, Value } from './types.ts';

describe('cell()', () => {
  it('normalizes inputs and extracts the dependency set', () => {
    const c = cell({
      doc: 'Monthly revenue, EUR-normalized',
      inputs: { orders: 'feeds.orders', fx: 'static.fx_rates', region: 'params.region' },
      formula: ({ orders }) => (orders as Row[]).length,
    });
    expect(c.kind).toBe('cell');
    expect(c.dependencies).toEqual(['feeds.orders', 'static.fx_rates', 'params.region']);
    expect(c.inputs.orders.namespace).toBe('feeds');
  });

  it('the registered formula stays a pure function of its declared inputs', () => {
    const c = cell({
      doc: 'revenue by month',
      inputs: { orders: 'feeds.orders' },
      formula: ({ orders }) =>
        table(orders as Row[])
          .groupBy('month')
          .rollup({ revenue: sum('amount') })
          .rows(),
    });
    const out = c.formula({
      orders: [
        { month: '2026-01', amount: 100 },
        { month: '2026-01', amount: 40 },
        { month: '2026-02', amount: 50 },
      ],
    });
    expect(out).toEqual([
      { month: '2026-01', revenue: 140 },
      { month: '2026-02', revenue: 50 },
    ]);
  });

  it('a cell with no inputs is allowed (a constant)', () => {
    const c = cell({ doc: 'a constant', formula: () => 42 });
    expect(c.dependencies).toEqual([]);
    expect(c.formula({})).toBe(42);
  });

  it('rejects a missing doc or formula', () => {
    expect(() => cell({ doc: '', formula: () => 1 })).toThrow();
    // @ts-expect-error formula is required
    expect(() => cell({ doc: 'x' })).toThrow();
  });
});

describe('testCell()', () => {
  it('carries the kind label and includes the subject in its dependencies', () => {
    const t = testCell({
      kind: 'specification',
      subject: 'revenue.by_month',
      inputs: { rows: 'fixtures.orders_holdout' },
      expect: ({ result }) => expectClose((result as { revenue: number }).revenue, 48_120, { rel: 0.01 }),
    });
    expect(t.testKind).toBe('specification');
    expect(t.dependencies).toEqual(['revenue.by_month', 'fixtures.orders_holdout']);
  });

  it('accepts a metamorphic relation', () => {
    const t = testCell({
      kind: 'metamorphic',
      subject: 'revenue.by_month',
      inputs: { orders: 'fixtures.orders_2026_06' },
      relation: permutationInvariance({ over: 'orders' }),
    });
    expect(t.relation?.type).toBe('permutationInvariance');
  });

  it('rejects a bad kind, a missing subject, or both/neither of expect|relation', () => {
    const ok = { subject: 'a.b', expect: () => ({ pass: true, message: 'ok' }) };
    // @ts-expect-error bad kind
    expect(() => testCell({ ...ok, kind: 'smoke' })).toThrow();
    expect(() => testCell({ ...ok, kind: 'specification', subject: '' })).toThrow();
    expect(() =>
      testCell({
        kind: 'specification',
        subject: 'a.b',
        expect: () => ({ pass: true, message: '' }),
        relation: permutationInvariance({ over: 'x' }),
      }),
    ).toThrow();
    expect(() => testCell({ kind: 'specification', subject: 'a.b' })).toThrow();
  });
});

describe('cell + testCell together (a formula and its metamorphic test)', () => {
  it('permutation invariance holds for a groupBy/rollup formula', () => {
    const byMonth = cell({
      doc: 'revenue by month',
      inputs: { orders: 'feeds.orders' },
      formula: ({ orders }) =>
        table(orders as Row[])
          .groupBy('month')
          .rollup({ revenue: sum('amount') })
          .rows(),
    });
    const orders: Row[] = [
      { month: '2026-01', amount: 100 },
      { month: '2026-02', amount: 50 },
      { month: '2026-01', amount: 40 },
    ];
    const t = testCell({
      kind: 'metamorphic',
      subject: 'revenue.by_month',
      inputs: { orders: 'feeds.orders' },
      relation: permutationInvariance({ over: 'orders' }),
    });
    // Simulate the M2 runner: baseline, then transform the input and re-run.
    const result = byMonth.formula({ orders }) as Value;
    const reversed = t.relation!.transform!(orders) as Row[];
    const transformedResult = byMonth.formula({ orders: reversed }) as Value;
    expect(t.relation!.evaluate({ result, transformedResult }).pass).toBe(true);
  });
});
