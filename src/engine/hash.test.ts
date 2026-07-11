import { describe, it, expect } from 'vitest';
import { contentKey } from './hash.ts';

describe('contentKey', () => {
  it('is independent of object key order', () => {
    expect(contentKey({ a: 1, b: 2 })).toBe(contentKey({ b: 2, a: 1 }));
  });

  it('depends on array order', () => {
    expect(contentKey([1, 2])).not.toBe(contentKey([2, 1]));
  });

  it('distinguishes number, string, boolean, and null (no cutoff laundering)', () => {
    expect(contentKey(1)).not.toBe(contentKey('1'));
    expect(contentKey(0)).not.toBe(contentKey(false));
    expect(contentKey(null)).not.toBe(contentKey('null'));
  });

  it('is stable for nested structures', () => {
    const a = contentKey({ rows: [{ x: 1, y: 2 }], meta: null });
    const b = contentKey({ meta: null, rows: [{ y: 2, x: 1 }] });
    expect(a).toBe(b);
  });
});
