import { describe, it, expect } from 'vitest';
import { lag, lead, scan, cumsum, cummax, cummin, runningMean, ema, asofJoin } from './ordered.ts';
import type { Row } from './types.ts';

describe('lag / lead', () => {
  it('lag reads the prior row per partition, ordered by a key', () => {
    const r: Row[] = [
      { cust: 'a', month: '2026-02', mrr: 20 },
      { cust: 'a', month: '2026-01', mrr: 10 },
      { cust: 'b', month: '2026-01', mrr: 5 },
      { cust: 'a', month: '2026-03', mrr: 30 },
    ];
    const out = lag(r, 'mrr', { as: 'prev', partitionBy: 'cust', orderBy: 'month' });
    // Rows come out in global orderBy (month) order — SQL window semantics — while
    // `prev` references the prior row within each cust partition.
    expect(out).toEqual([
      { cust: 'a', month: '2026-01', mrr: 10, prev: null },
      { cust: 'b', month: '2026-01', mrr: 5, prev: null },
      { cust: 'a', month: '2026-02', mrr: 20, prev: 10 },
      { cust: 'a', month: '2026-03', mrr: 30, prev: 20 },
    ]);
  });

  it('lead reads the next row; trailing edge gets fill', () => {
    const r: Row[] = [
      { m: 1, v: 'a' },
      { m: 2, v: 'b' },
      { m: 3, v: 'c' },
    ];
    const out = lead(r, 'v', { as: 'next', orderBy: 'm', fill: 'END' });
    expect(out.map((x) => x.next)).toEqual(['b', 'c', 'END']);
  });

  it('n>1 lag', () => {
    const r: Row[] = [{ i: 0 }, { i: 1 }, { i: 2 }, { i: 3 }];
    const out = lag(r, 'i', { as: 'p2', n: 2, orderBy: 'i' });
    expect(out.map((x) => x.p2)).toEqual([null, null, 0, 1]);
  });
});

describe('scan — running folds', () => {
  const r: Row[] = [{ x: 10 }, { x: 20 }, { x: 5 }, { x: 40 }];

  it('cumsum / cummax / cummin', () => {
    const out = scan(r, { rt: cumsum('x'), rmax: cummax('x'), rmin: cummin('x') });
    expect(out.map((o) => o.rt)).toEqual([10, 30, 35, 75]);
    expect(out.map((o) => o.rmax)).toEqual([10, 20, 20, 40]);
    expect(out.map((o) => o.rmin)).toEqual([10, 10, 5, 5]);
  });

  it('runningMean', () => {
    const out = scan(r, { avg: runningMean('x') });
    expect(out.map((o) => o.avg)).toEqual([10, 15, 35 / 3, 75 / 4]);
  });

  it('ema seeds on the first value', () => {
    const out = scan([{ x: 2 }, { x: 4 }], { e: ema('x', 0.5) });
    expect(out.map((o) => o.e)).toEqual([2, 3]); // 0.5*4 + 0.5*2
  });

  it('cumsum is null until the first finite value, then carries across nulls', () => {
    const gapped: Row[] = [{ x: null }, { x: 3 }, { x: null }, { x: 2 }];
    const out = scan(gapped, { rt: cumsum('x') });
    expect(out.map((o) => o.rt)).toEqual([null, 3, 3, 5]);
  });

  it('partitions independently', () => {
    const p: Row[] = [
      { g: 'a', x: 1 },
      { g: 'b', x: 100 },
      { g: 'a', x: 2 },
    ];
    const out = scan(p, { rt: cumsum('x') }, { partitionBy: 'g' });
    expect(out).toEqual([
      { g: 'a', x: 1, rt: 1 },
      { g: 'b', x: 100, rt: 100 },
      { g: 'a', x: 2, rt: 3 },
    ]);
  });
});

describe('asofJoin — the FX-gap carry-forward (Meridian probe 1)', () => {
  // GBP has no 2024-02 rate; an equi-join would NaN-poison EUR. asof carries 2024-01 forward.
  const fx: Row[] = [
    { currency: 'GBP', month: '2024-01', rate: 1.17 },
    { currency: 'GBP', month: '2024-03', rate: 1.19 },
    { currency: 'EUR', month: '2024-02', rate: 1 },
  ];
  const invoices: Row[] = [
    { currency: 'GBP', month: '2024-01', amount: 100 },
    { currency: 'GBP', month: '2024-02', amount: 200 }, // the gap month
    { currency: 'GBP', month: '2024-03', amount: 300 },
    { currency: 'EUR', month: '2024-02', amount: 50 },
  ];

  it('carries forward the last known rate across the gap', () => {
    const out = asofJoin(invoices, fx, { on: 'currency', match: 'month' });
    expect(out).toEqual([
      { currency: 'GBP', month: '2024-01', amount: 100, rate: 1.17 },
      { currency: 'GBP', month: '2024-02', amount: 200, rate: 1.17 }, // carried forward
      { currency: 'GBP', month: '2024-03', amount: 300, rate: 1.19 },
      { currency: 'EUR', month: '2024-02', amount: 50, rate: 1 },
    ]);
  });

  it('a match before the first known rate is a null miss', () => {
    const out = asofJoin([{ currency: 'GBP', month: '2023-12', amount: 9 }], fx, {
      on: 'currency',
      match: 'month',
    });
    expect(out[0].rate).toBeNull();
  });

  it('forward direction picks the nearest at-or-after', () => {
    const out = asofJoin([{ currency: 'GBP', month: '2024-02', amount: 1 }], fx, {
      on: 'currency',
      match: 'month',
      direction: 'forward',
    });
    expect(out[0].rate).toBe(1.19); // the 2024-03 rate
  });
});
