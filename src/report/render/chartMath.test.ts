import { describe, expect, it } from 'vitest';
import { linearScale, niceDomain, ticks, categories, seriesByColor, histogram, pieSlices } from './chartMath.ts';
import type { Row } from '../../stdlib/types.ts';

describe('chartMath', () => {
  it('linearScale maps domain endpoints to range endpoints', () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s(0)).toBe(0);
    expect(s(10)).toBe(100);
    expect(s(5)).toBe(50);
  });

  it('linearScale guards a degenerate single-value domain', () => {
    const s = linearScale([5, 5], [0, 100]);
    expect(Number.isFinite(s(5))).toBe(true);
  });

  it('niceDomain anchors one-signed data to zero and pads a flat series', () => {
    expect(niceDomain([3, 7, 5])).toEqual([0, 7]);
    expect(niceDomain([-3, -7])).toEqual([-7, 0]);
    expect(niceDomain([5, 5])).toEqual([0, 5]); // positive data anchors to zero
    expect(niceDomain([0, 0])).toEqual([-1, 1]); // a genuinely flat-at-zero series pads
    expect(niceDomain([null, null])).toEqual([0, 1]);
  });

  it('ticks include both endpoints', () => {
    const t = ticks([0, 10], 2);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(10);
  });

  it('categories are distinct in first-seen order', () => {
    const rows: Row[] = [{ m: 'jan' }, { m: 'feb' }, { m: 'jan' }];
    expect(categories(rows, 'm')).toEqual(['jan', 'feb']);
  });

  it('seriesByColor groups by the color field', () => {
    const rows: Row[] = [
      { x: 1, s: 'a' },
      { x: 2, s: 'b' },
      { x: 3, s: 'a' },
    ];
    const series = seriesByColor(rows, 's');
    expect(series.map((g) => g.name)).toEqual(['a', 'b']);
    expect(series[0].rows).toHaveLength(2);
    expect(seriesByColor(rows, undefined)).toHaveLength(1);
  });

  it('histogram buckets values into equal-width bins', () => {
    const rows: Row[] = [0, 1, 2, 9, 10].map((v) => ({ v }));
    const bins = histogram(rows, 'v', 2);
    expect(bins).toHaveLength(2);
    expect(bins.reduce((acc, b) => acc + b.count, 0)).toBe(5);
  });

  it('pieSlices enforces the ≤5-slice rule with an "other" bucket', () => {
    const rows: Row[] = [10, 9, 8, 7, 6, 5, 4].map((v, i) => ({ v, label: `s${i}` }));
    const slices = pieSlices(rows, 'v', 'label');
    expect(slices).toHaveLength(5);
    expect(slices[4].label).toBe('other');
    expect(slices[4].value).toBe(6 + 5 + 4);
  });

  it('pieSlices drops non-positive values', () => {
    const rows: Row[] = [{ v: 5, label: 'a' }, { v: 0, label: 'b' }, { v: -1, label: 'c' }];
    expect(pieSlices(rows, 'v', 'label')).toEqual([{ label: 'a', value: 5 }]);
  });
});
