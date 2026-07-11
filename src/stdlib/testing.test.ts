import { describe, it, expect } from 'vitest';
import { deepEqual, expectEqual, expectClose } from './testing.ts';

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
