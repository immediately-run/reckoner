import { describe, it, expect } from 'vitest';
import { sum, mean, median, quantile, min, max, count, first } from './aggregate.ts';
import type { Row } from './types.ts';

const rows = (xs: (number | null)[]): Row[] => xs.map((x) => ({ x }));

describe('aggregators — happy path', () => {
  it('sum/mean/median over a plain column', () => {
    const r = rows([1, 2, 3, 4]);
    expect(sum('x')(r)).toBe(10);
    expect(mean('x')(r)).toBe(2.5);
    expect(median('x')(r)).toBe(2.5);
  });

  it('median of odd count is the middle value', () => {
    expect(median('x')(rows([3, 1, 2]))).toBe(2);
  });

  it('min/max ignore order', () => {
    const r = rows([5, -2, 3]);
    expect(min('x')(r)).toBe(-2);
    expect(max('x')(r)).toBe(5);
  });

  it('quantile interpolates linearly', () => {
    const r = rows([0, 10]);
    expect(quantile('x', 0.5)(r)).toBe(5);
    expect(quantile('x', 0.25)(r)).toBe(2.5);
    expect(quantile('x', 0)(r)).toBe(0);
    expect(quantile('x', 1)(r)).toBe(10);
  });
});

describe('aggregators — null semantics (DSL-6)', () => {
  it('empty group returns null, never 0', () => {
    expect(sum('x')([])).toBeNull();
    expect(mean('x')([])).toBeNull();
    expect(median('x')([])).toBeNull();
    expect(min('x')([])).toBeNull();
    expect(max('x')([])).toBeNull();
    expect(quantile('x', 0.9)([])).toBeNull();
  });

  it('a group with only null values is the same as empty', () => {
    const r = rows([null, null]);
    expect(sum('x')(r)).toBeNull();
    expect(mean('x')(r)).toBeNull();
  });

  it('nulls are skipped, not counted as 0', () => {
    const r = rows([2, null, 4]);
    expect(sum('x')(r)).toBe(6);
    expect(mean('x')(r)).toBe(3); // 6 / 2, not 6 / 3
  });

  it('non-finite values never leak into an aggregate', () => {
    expect(sum('x')([{ x: Infinity as unknown as number }, { x: 1 }] as Row[])).toBe(1);
  });
});

describe('count and first', () => {
  it('count() counts rows; count(col) counts present values', () => {
    const r = rows([1, null, 3]);
    expect(count()(r)).toBe(3);
    expect(count('x')(r)).toBe(2);
  });

  it('first takes the leading row value; null on empty', () => {
    expect(first('x')(rows([7, 8]))).toBe(7);
    expect(first('x')([])).toBeNull();
  });
});
