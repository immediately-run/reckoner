import { describe, it, expect } from 'vitest';
import {
  deepEqual,
  expectAtLeast,
  expectAtMost,
  expectClose,
  expectEqual,
  expectGreaterThan,
  expectLessThan,
} from './testing.ts';

describe('deepEqual', () => {
  it('scalars, arrays, and nested objects', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual([1, { a: 2 }], [1, { a: 2 }])).toBe(true);
    expect(deepEqual({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
  });

  it('distinguishes differences and shapes', () => {
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });
});

describe('expectEqual', () => {
  it('passes on deep equality, fails otherwise, with a message', () => {
    expect(expectEqual(3, 3).pass).toBe(true);
    const bad = expectEqual([1], [2]);
    expect(bad.pass).toBe(false);
    expect(bad.message).toContain('expected');
  });
});

describe('expectClose', () => {
  it('exact when no tolerance given', () => {
    expect(expectClose(1, 1).pass).toBe(true);
    expect(expectClose(1.0001, 1).pass).toBe(false);
  });

  it('relative tolerance', () => {
    expect(expectClose(48_600, 48_120, { rel: 0.01 }).pass).toBe(true); // within 1%
    expect(expectClose(50_000, 48_120, { rel: 0.01 }).pass).toBe(false);
  });

  it('absolute tolerance, and abs-or-rel when both given', () => {
    expect(expectClose(100.4, 100, { abs: 0.5 }).pass).toBe(true);
    expect(expectClose(100.4, 100, { abs: 0.1, rel: 0.01 }).pass).toBe(true); // rel leg (1) passes
  });

  it('non-numeric operands fail rather than coerce', () => {
    expect(expectClose(null, 1).pass).toBe(false);
    expect(expectClose('1', 1).pass).toBe(false);
  });
});

describe('bound assertions (R3-404)', () => {
  it('expectLessThan passes strictly under, fails at the bound and above', () => {
    expect(expectLessThan(40, 41).pass).toBe(true);
    expect(expectLessThan(41, 41).pass).toBe(false); // equal-to-bound fails (exclusive)
    expect(expectLessThan(42, 41).pass).toBe(false);
  });

  it('expectAtMost passes at the bound (inclusive)', () => {
    expect(expectAtMost(41, 41).pass).toBe(true);
    expect(expectAtMost(40, 41).pass).toBe(true);
    expect(expectAtMost(42, 41).pass).toBe(false);
  });

  it('expectGreaterThan passes strictly over, fails at the bound and below', () => {
    expect(expectGreaterThan(42, 41).pass).toBe(true);
    expect(expectGreaterThan(41, 41).pass).toBe(false); // equal-to-bound fails (exclusive)
    expect(expectGreaterThan(40, 41).pass).toBe(false);
  });

  it('expectAtLeast passes at the bound (inclusive)', () => {
    expect(expectAtLeast(41, 41).pass).toBe(true);
    expect(expectAtLeast(42, 41).pass).toBe(true);
    expect(expectAtLeast(40, 41).pass).toBe(false);
  });

  it('a failing bound reports actual, bound and direction — not just false', () => {
    const r = expectLessThan(60, 41);
    expect(r.pass).toBe(false);
    expect(r.actual).toBe(60);
    expect(r.bound).toBe(41);
    expect(r.direction).toBe('<');
    expect(r.message).toContain('60 < 41');
  });

  it('a passing bound reports like the siblings (actual, bound, direction)', () => {
    const r = expectAtLeast(2.0, 1.5);
    expect(r.pass).toBe(true);
    expect(r.actual).toBe(2.0);
    expect(r.bound).toBe(1.5);
    expect(r.direction).toBe('>=');
  });

  it('NaN and null operands fail rather than coerce', () => {
    expect(expectLessThan(NaN, 41).pass).toBe(false);
    expect(expectGreaterThan(null, 0).pass).toBe(false);
    expect(expectAtMost(true, 5).pass).toBe(false);
    expect(expectAtLeast('3', 1).pass).toBe(false);
  });

  it('the four directions are distinct assertions', () => {
    expect(expectLessThan(5, 5).pass).toBe(false);
    expect(expectAtMost(5, 5).pass).toBe(true);
    expect(expectGreaterThan(5, 5).pass).toBe(false);
    expect(expectAtLeast(5, 5).pass).toBe(true);
  });
});
