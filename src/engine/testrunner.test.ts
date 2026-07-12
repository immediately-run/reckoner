import { describe, it, expect } from 'vitest';
import {
  cell,
  testCell,
  table,
  sum,
  permutationInvariance,
  conservation,
  expectClose,
} from '../stdlib/index.ts';
import { runTest, runSuite, classifyCell } from './testrunner.ts';
import type { Row, Value } from '../stdlib/types.ts';

describe('classifyCell — the review-surface verdict (§6)', () => {
  it('no tests → untested', () => {
    expect(classifyCell([])).toBe('untested');
  });

  it('any failure → failing', () => {
    expect(classifyCell([{ kind: 'metamorphic', pass: true }, { kind: 'specification', pass: false }])).toBe('failing');
  });

  it('a passing metamorphic/property leg → validated', () => {
    expect(classifyCell([{ kind: 'metamorphic', pass: true }])).toBe('validated');
    expect(classifyCell([{ kind: 'property', pass: true }, { kind: 'characterization', pass: true }])).toBe('validated');
  });

  it('only example-based passing tests → pinned, not validated', () => {
    expect(classifyCell([{ kind: 'characterization', pass: true }])).toBe('pinned');
    expect(classifyCell([{ kind: 'specification', pass: true }, { kind: 'characterization', pass: true }])).toBe('pinned');
  });
});

describe('runTest — expect', () => {
  it('runs an example-based assertion over the subject value', () => {
    const t = testCell({
      kind: 'specification',
      subject: 'revenue.total',
      inputs: { rows: 'fixtures.holdout' },
      expect: ({ result }) => expectClose(result as number, 48_120, { rel: 0.01 }),
    });
    expect(runTest(t, { subject: 48_600, inputs: {} }).pass).toBe(true);
    expect(runTest(t, { subject: 60_000, inputs: {} }).pass).toBe(false);
  });
});

describe('runTest — metamorphic relation with reevaluate', () => {
  // subject: revenue by month = groupBy(month) → sum(amount)
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
  const result = byMonth.formula({ orders }) as Value;

  it('permutation invariance passes — the runner transforms the input and re-runs', () => {
    const t = testCell({
      kind: 'metamorphic',
      subject: 'revenue.by_month',
      inputs: { orders: 'feeds.orders' },
      relation: permutationInvariance({ over: 'orders' }),
    });
    const out = runTest(t, {
      subject: result,
      inputs: { orders },
      reevaluate: (inputs) => byMonth.formula(inputs) as Value,
    });
    expect(out.pass).toBe(true);
  });

  it('fails when the subject is not actually invariant', () => {
    const t = testCell({
      kind: 'metamorphic',
      subject: 'x',
      inputs: { orders: 'feeds.orders' },
      relation: permutationInvariance({ over: 'orders' }),
    });
    // a subject that echoes input order is NOT permutation-invariant
    const out = runTest(t, {
      subject: orders,
      inputs: { orders },
      reevaluate: (inputs) => inputs.orders,
    });
    expect(out.pass).toBe(false);
  });

  it('a relation needing reevaluate reports cleanly when the port is missing', () => {
    const t = testCell({
      kind: 'metamorphic',
      subject: 'x',
      inputs: { orders: 'feeds.orders' },
      relation: permutationInvariance({ over: 'orders' }),
    });
    expect(runTest(t, { subject: result, inputs: { orders } }).pass).toBe(false);
  });
});

describe('runTest — conservation (no reevaluate needed)', () => {
  it('checks the row-reconciliation identity on the subject', () => {
    const t = testCell({
      kind: 'metamorphic',
      subject: 'mrr.movements',
      inputs: { m: 'fixtures.movements' },
      relation: conservation({ components: ['start', 'movement'], equals: 'end' }),
    });
    const good = [{ start: 1000, movement: 160, end: 1160 }];
    const bad = [{ start: 1000, movement: 160, end: 9999 }];
    expect(runTest(t, { subject: good, inputs: {} }).pass).toBe(true);
    expect(runTest(t, { subject: bad, inputs: {} }).pass).toBe(false);
  });
});

describe('runSuite — verdict over a subject cell', () => {
  it('a metamorphic pass promotes the cell to validated', () => {
    const orders: Row[] = [{ month: '2026-01', amount: 10 }];
    const byMonth = cell({
      doc: 'rev',
      inputs: { orders: 'feeds.orders' },
      formula: ({ orders }) => table(orders as Row[]).groupBy('month').rollup({ revenue: sum('amount') }).rows(),
    });
    const result = byMonth.formula({ orders }) as Value;

    const tests = [
      testCell({
        kind: 'characterization',
        subject: 'revenue.by_month',
        inputs: { orders: 'feeds.orders' },
        expect: ({ result: r }) => ({ pass: Array.isArray(r), message: 'shape' }),
      }),
      testCell({
        kind: 'metamorphic',
        subject: 'revenue.by_month',
        inputs: { orders: 'feeds.orders' },
        relation: permutationInvariance({ over: 'orders' }),
      }),
    ];

    const suite = runSuite(tests, () => ({
      subject: result,
      inputs: { orders },
      reevaluate: (inputs) => byMonth.formula(inputs) as Value,
    }));
    expect(suite.outcomes.every((o) => o.result.pass)).toBe(true);
    expect(suite.verdict).toBe('validated');
  });
});
