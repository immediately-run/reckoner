import { describe, expect, it } from 'vitest';
import { asScalar, asNumber, asRows, numericField, labelField } from './shape.ts';

describe('shape guards', () => {
  it('asScalar accepts scalars, rejects tables/objects', () => {
    expect(asScalar(5)).toEqual({ ok: true, data: 5 });
    expect(asScalar(null)).toEqual({ ok: true, data: null });
    expect(asScalar([1, 2]).ok).toBe(false);
    expect(asScalar({ a: 1 }).ok).toBe(false);
  });

  it('asNumber requires a finite number', () => {
    expect(asNumber(3)).toEqual({ ok: true, data: 3 });
    expect(asNumber(null).ok).toBe(false);
    expect(asNumber('7').ok).toBe(false);
  });

  it('asRows requires an array of object rows', () => {
    expect(asRows([{ a: 1 }]).ok).toBe(true);
    expect(asRows(5).ok).toBe(false);
    expect(asRows([1, 2]).ok).toBe(false);
    expect(asRows([null]).ok).toBe(false);
  });

  it('numericField returns null (never NaN) for non-numeric cells', () => {
    expect(numericField({ x: 4 }, 'x')).toBe(4);
    expect(numericField({ x: 'a' }, 'x')).toBe(null);
    expect(numericField({}, 'x')).toBe(null);
  });

  it('labelField stringifies a cell for display', () => {
    expect(labelField({ m: 'jan' }, 'm')).toBe('jan');
    expect(labelField({ m: 3 }, 'm')).toBe('3');
    expect(labelField({}, 'm')).toBe('—');
  });
});
