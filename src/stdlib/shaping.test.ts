import { describe, it, expect } from 'vitest';
import {
  filter,
  derive,
  sort,
  groupBy,
  rollup,
  aggregate,
  join,
  antiJoin,
  pivot,
  topN,
} from './shaping.ts';
import { sum, count } from './aggregate.ts';
import type { Row } from './types.ts';

describe('filter / derive', () => {
  it('filter keeps matching rows', () => {
    const r: Row[] = [{ a: 1 }, { a: 2 }, { a: 3 }];
    expect(filter(r, (x) => (x.a as number) >= 2)).toEqual([{ a: 2 }, { a: 3 }]);
  });

  it('derive adds columns and can build on earlier keys in one call', () => {
    const r: Row[] = [{ a: 2 }];
    expect(derive(r, { b: (x) => (x.a as number) * 10, c: (x) => (x.b as number) + 1 })).toEqual([
      { a: 2, b: 20, c: 21 },
    ]);
  });

  it('derive sanitizes NaN / Infinity to null (never leaks silently)', () => {
    const r: Row[] = [{ a: 1, b: 0 }];
    expect(derive(r, { q: (x) => (x.a as number) / (x.b as number) })).toEqual([
      { a: 1, b: 0, q: null },
    ]);
  });
});

describe('sort', () => {
  it('multi-key with directions, nulls last', () => {
    const r: Row[] = [
      { k: 'b', n: 1 },
      { k: 'a', n: 2 },
      { k: 'a', n: null },
      { k: 'a', n: 1 },
    ];
    expect(sort(r, ['k', { col: 'n', dir: 'desc' }])).toEqual([
      { k: 'a', n: 2 },
      { k: 'a', n: 1 },
      { k: 'a', n: null }, // null sorts last even under desc
      { k: 'b', n: 1 },
    ]);
  });

  it('is a copy — does not mutate the input', () => {
    const r: Row[] = [{ a: 2 }, { a: 1 }];
    const sorted = sort(r, 'a');
    expect(sorted).toEqual([{ a: 1 }, { a: 2 }]);
    expect(r).toEqual([{ a: 2 }, { a: 1 }]);
  });
});

describe('groupBy / rollup / aggregate', () => {
  it('rollup emits key columns plus aggregates, in first-seen group order', () => {
    const r: Row[] = [
      { m: 'jan', v: 1 },
      { m: 'feb', v: 2 },
      { m: 'jan', v: 3 },
    ];
    expect(rollup(groupBy(r, 'm'), { total: sum('v'), n: count() })).toEqual([
      { m: 'jan', total: 4, n: 2 },
      { m: 'feb', total: 2, n: 1 },
    ]);
  });

  it('aggregate is groupBy+rollup in one', () => {
    const r: Row[] = [{ g: 'x', v: 5 }, { g: 'x', v: 5 }];
    expect(aggregate(r, 'g', { total: sum('v') })).toEqual([{ g: 'x', total: 10 }]);
  });
});

describe('join family', () => {
  const orders: Row[] = [
    { id: 1, currency: 'USD', amount: 100 },
    { id: 2, currency: 'EUR', amount: 50 },
    { id: 3, currency: 'GBP', amount: 20 },
  ];
  const fx: Row[] = [
    { currency: 'USD', rate: 0.9 },
    { currency: 'EUR', rate: 1 },
  ];

  it('inner join drops unmatched left rows', () => {
    const out = join(orders, fx, { on: 'currency' });
    expect(out).toEqual([
      { id: 1, currency: 'USD', amount: 100, rate: 0.9 },
      { id: 2, currency: 'EUR', amount: 50, rate: 1 },
    ]);
  });

  it('left join yields null for right columns on a miss', () => {
    const out = join(orders, fx, { on: 'currency', how: 'left' });
    expect(out[2]).toEqual({ id: 3, currency: 'GBP', amount: 20, rate: null });
  });

  it('full join emits unmatched right rows with null left columns', () => {
    const extraFx: Row[] = [...fx, { currency: 'JPY', rate: 0.006 }];
    const out = join(orders, extraFx, { on: 'currency', how: 'full' });
    expect(out).toContainEqual({ id: null, currency: 'JPY', amount: null, rate: 0.006 });
  });

  it('composite key and {left,right} name mapping', () => {
    const left: Row[] = [{ region: 'EU', month: '2026-01', x: 1 }];
    const right: Row[] = [{ r: 'EU', mo: '2026-01', y: 2 }];
    const out = join(left, right, { on: { left: ['region', 'month'], right: ['r', 'mo'] } });
    expect(out).toEqual([{ region: 'EU', month: '2026-01', x: 1, y: 2 }]);
  });

  it('antiJoin keeps only left rows with no match (churn primitive)', () => {
    const thisMonth: Row[] = [{ cust: 'a' }, { cust: 'b' }, { cust: 'c' }];
    const lastMonth: Row[] = [{ cust: 'a' }, { cust: 'c' }];
    // present last, absent this = churned:
    expect(antiJoin(lastMonth, thisMonth, { on: 'cust' })).toEqual([]);
    // present this, absent last = new:
    expect(antiJoin(thisMonth, lastMonth, { on: 'cust' })).toEqual([{ cust: 'b' }]);
  });
});

describe('pivot — normalize before pivot (DSL-4 cohort retention)', () => {
  it('produces one row per index, one column per distinct value, sorted', () => {
    // counts per (cohort, offset), already normalized to pct
    const long: Row[] = [
      { cohort: '2026-01', offset: 0, pct: 1 },
      { cohort: '2026-01', offset: 1, pct: 0.8 },
      { cohort: '2026-01', offset: 2, pct: 0.6 },
      { cohort: '2026-02', offset: 0, pct: 1 },
      { cohort: '2026-02', offset: 1, pct: 0.9 },
    ];
    expect(pivot(long, { index: 'cohort', columns: 'offset', values: 'pct' })).toEqual([
      { cohort: '2026-01', '0': 1, '1': 0.8, '2': 0.6 },
      { cohort: '2026-02', '0': 1, '1': 0.9, '2': null }, // absent cell → null
    ]);
  });
});

describe('topN with Other bucket (DSL-7)', () => {
  it('keeps top N and folds the rest into one caller-shaped row', () => {
    const custs: Row[] = [
      { name: 'A', arr: 100 },
      { name: 'B', arr: 80 },
      { name: 'C', arr: 40 },
      { name: 'D', arr: 30 },
    ];
    const out = topN(custs, 2, {
      by: 'arr',
      other: (rest) => ({ name: 'Other', arr: sum('arr')(rest) }),
    });
    expect(out).toEqual([
      { name: 'A', arr: 100 },
      { name: 'B', arr: 80 },
      { name: 'Other', arr: 70 },
    ]);
  });

  it('no Other row when everything fits in the top N', () => {
    const custs: Row[] = [{ name: 'A', arr: 1 }];
    expect(topN(custs, 5, { by: 'arr', other: () => ({ name: 'Other' }) })).toEqual([
      { name: 'A', arr: 1 },
    ]);
  });
});
