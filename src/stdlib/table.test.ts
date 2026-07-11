import { describe, it, expect } from 'vitest';
import { table } from './table.ts';
import { sum } from './aggregate.ts';
import { cumsum } from './ordered.ts';
import { safeDiv } from './nulls.ts';
import type { Row } from './types.ts';

describe('fluent table() — the §3.1 revenue.by_month example', () => {
  it('filter → join fx → derive eur → groupBy → rollup', () => {
    const orders: Row[] = [
      { region: 'EMEA', currency: 'USD', amount: 100, month: '2026-01' },
      { region: 'EMEA', currency: 'EUR', amount: 50, month: '2026-01' },
      { region: 'AMER', currency: 'USD', amount: 200, month: '2026-01' },
      { region: 'EMEA', currency: 'EUR', amount: 80, month: '2026-02' },
    ];
    const fx: Row[] = [
      { currency: 'USD', rate: 0.9 },
      { currency: 'EUR', rate: 1 },
    ];
    const region: string = 'EMEA';

    const out = table(orders)
      .filter((r) => region === 'all' || r.region === region)
      .join(fx, { on: 'currency' })
      .derive({ eur: (r) => (r.amount as number) * (r.rate as number) })
      .groupBy('month')
      .rollup({ revenue: sum('eur') })
      .rows();

    expect(out).toEqual([
      { month: '2026-01', revenue: 140 }, // 100*0.9 + 50*1
      { month: '2026-02', revenue: 80 },
    ]);
  });
});

describe('conservation invariant (Meridian probe 2 — the MRR waterfall reconciles to 0.0)', () => {
  it('start + new + expansion + contraction + churned + reactivation = end', () => {
    const movements: Row[] = [
      { month: '2026-01', start: 1000, new: 200, expansion: 50, contraction: -30, churned: -80, reactivation: 20, end: 1160 },
      { month: '2026-02', start: 1160, new: 100, expansion: 40, contraction: -10, churned: -150, reactivation: 0, end: 1140 },
    ];
    const withRecon = table(movements)
      .derive({
        recon: (r) =>
          (r.end as number) -
          ((r.start as number) +
            (r.new as number) +
            (r.expansion as number) +
            (r.contraction as number) +
            (r.churned as number) +
            (r.reactivation as number)),
      })
      .rows();
    for (const row of withRecon) expect(row.recon).toBe(0);
  });
});

describe('cohort retention — normalize before pivot (DSL-4), full pipeline', () => {
  it('groupBy → size join back → derive pct → pivot', () => {
    // raw: one row per (cohort, offset) with a headcount
    const raw: Row[] = [
      { cohort: '2026-01', offset: 0, n: 100 },
      { cohort: '2026-01', offset: 1, n: 82 },
      { cohort: '2026-01', offset: 2, n: 61 },
      { cohort: '2026-02', offset: 0, n: 120 },
      { cohort: '2026-02', offset: 1, n: 108 },
    ];
    // cohort size = the offset-0 headcount
    const sizes = table(raw)
      .filter((r) => r.offset === 0)
      .derive({ size: (r) => r.n })
      .rows()
      .map((r) => ({ cohort: r.cohort, size: r.size }));

    const heatmap = table(raw)
      .join(sizes, { on: 'cohort' })
      .derive({ pct: (r) => safeDiv(r.n as number, r.size as number) })
      .pivot({ index: 'cohort', columns: 'offset', values: 'pct' })
      .rows();

    expect(heatmap).toEqual([
      { cohort: '2026-01', '0': 1, '1': 0.82, '2': 0.61 },
      { cohort: '2026-02', '0': 1, '1': 0.9, '2': null },
    ]);
  });
});

describe('fluent composition — running total over a sorted, filtered frame', () => {
  it('sort → scan cumsum', () => {
    const daily: Row[] = [
      { day: '2026-01-03', amt: 5 },
      { day: '2026-01-01', amt: 10 },
      { day: '2026-01-02', amt: 20 },
    ];
    const out = table(daily).sort('day').scan({ running: cumsum('amt') }).rows();
    expect(out).toEqual([
      { day: '2026-01-01', amt: 10, running: 10 },
      { day: '2026-01-02', amt: 20, running: 30 },
      { day: '2026-01-03', amt: 5, running: 35 },
    ]);
  });
});
