import { describe, it, expect } from 'vitest';
import { trend, outliers, deltas } from './screening.ts';
import type { Row } from './types.ts';

describe('trend', () => {
  it('rising series: up direction, positive slope and change', () => {
    const r: Row[] = [{ v: 10 }, { v: 20 }, { v: 30 }];
    const t = trend(r, { value: 'v' });
    expect(t.first).toBe(10);
    expect(t.last).toBe(30);
    expect(t.change).toBe(20);
    expect(t.pct).toBe(2); // 20 / 10
    expect(t.slope).toBe(10);
    expect(t.direction).toBe('up');
  });

  it('falling and flat', () => {
    expect(trend([{ v: 5 }, { v: 3 }], { value: 'v' }).direction).toBe('down');
    expect(trend([{ v: 7 }, { v: 7 }, { v: 7 }], { value: 'v' }).direction).toBe('flat');
  });

  it('empty is null/flat, not a throw', () => {
    expect(trend([], { value: 'v' })).toMatchObject({ first: null, direction: 'flat' });
  });
});

describe('outliers', () => {
  it('IQR flags a far value', () => {
    const r: Row[] = [{ x: 10 }, { x: 11 }, { x: 12 }, { x: 13 }, { x: 100 }];
    expect(outliers(r, { value: 'x' })).toEqual([{ x: 100 }]);
  });

  it('no outliers in a tight cluster', () => {
    expect(outliers([{ x: 5 }, { x: 6 }, { x: 5 }, { x: 6 }], { value: 'x' })).toEqual([]);
  });

  it('z-score method with a custom threshold', () => {
    const r: Row[] = [{ x: 1 }, { x: 1 }, { x: 1 }, { x: 1 }, { x: 9 }];
    expect(outliers(r, { value: 'x', method: 'zscore', k: 1.5 })).toEqual([{ x: 9 }]);
  });

  it('ignores non-numeric rows', () => {
    expect(outliers([{ x: null }, { x: 'nope' }], { value: 'x' })).toEqual([]);
  });
});

describe('deltas', () => {
  it('adds delta and pct over the current order; first row null', () => {
    const r: Row[] = [{ m: 'jan', v: 100 }, { m: 'feb', v: 150 }, { m: 'mar', v: 120 }];
    expect(deltas(r, { value: 'v' })).toEqual([
      { m: 'jan', v: 100, delta: null, pct: null },
      { m: 'feb', v: 150, delta: 50, pct: 0.5 },
      { m: 'mar', v: 120, delta: -30, pct: -0.2 },
    ]);
  });

  it('custom output column names, null-safe across gaps', () => {
    const r: Row[] = [{ v: 10 }, { v: null }, { v: 20 }];
    const out = deltas(r, { value: 'v', as: 'd', pctAs: 'p' });
    expect(out[1]).toMatchObject({ d: null, p: null }); // current is null
    expect(out[2]).toMatchObject({ d: null, p: null }); // previous was null
  });
});
