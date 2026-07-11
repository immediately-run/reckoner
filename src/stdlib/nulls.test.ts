import { describe, it, expect } from 'vitest';
import { coalesce, orElse, safeDiv } from './nulls.ts';

describe('coalesce / orElse', () => {
  it('coalesce returns the first present argument', () => {
    expect(coalesce(null, undefined, 3, 4)).toBe(3);
    expect(coalesce(0, 1)).toBe(0); // 0 is present, not empty
    expect(coalesce('', 'x')).toBe(''); // empty string is present
  });

  it('coalesce with nothing present is null', () => {
    expect(coalesce(null, undefined)).toBeNull();
    expect(coalesce()).toBeNull();
  });

  it('orElse falls back only on null/undefined', () => {
    expect(orElse(null, 5)).toBe(5);
    expect(orElse(undefined, 5)).toBe(5);
    expect(orElse(0, 5)).toBe(0);
    expect(orElse(false, 5)).toBe(false);
  });
});

describe('safeDiv (DSL-6 ÷0 → null)', () => {
  it('divides normally', () => {
    expect(safeDiv(10, 4)).toBe(2.5);
  });

  it('÷0 is null, not Infinity', () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(0, 0)).toBeNull();
  });

  it('absent or non-numeric operands are null, not NaN', () => {
    expect(safeDiv(null, 2)).toBeNull();
    expect(safeDiv(2, null)).toBeNull();
    expect(safeDiv(undefined, 2)).toBeNull();
    expect(safeDiv('x', 2)).toBeNull();
  });
});
