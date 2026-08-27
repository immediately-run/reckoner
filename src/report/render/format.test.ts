import { describe, expect, it } from 'vitest';
import { formatNumber, formatScalar, formatDelta } from './format.ts';

describe('format', () => {
  it('formatNumber honors the enum', () => {
    expect(formatNumber(1234.5, 'number')).toMatch(/1,234\.5/);
    expect(formatNumber(0.125, 'percent')).toMatch(/12\.5%/);
    expect(formatNumber(1000, 'currency')).toMatch(/€|EUR/);
    expect(formatNumber(NaN)).toBe('—');
  });

  it('formatScalar renders each scalar type and null', () => {
    expect(formatScalar(null)).toBe('—');
    expect(formatScalar(true)).toBe('yes');
    expect(formatScalar('hi')).toBe('hi');
    expect(formatScalar(42)).toMatch(/42/);
  });

  it('formatDelta computes signed relative change and direction', () => {
    expect(formatDelta(110, 100).direction).toBe('up');
    expect(formatDelta(110, 100).label).toMatch(/\+.*10%/);
    expect(formatDelta(90, 100).direction).toBe('down');
    expect(formatDelta(100, 100).direction).toBe('flat');
  });

  it('formatDelta in percent mode is an absolute point delta', () => {
    const d = formatDelta(0.2, 0.1, 'percent');
    expect(d.direction).toBe('up');
    expect(d.label).toMatch(/\+.*10%/);
  });
});

describe('finance formats (R3-382)', () => {
  it('multiple renders 2.75x', () => {
    expect(formatNumber(2.7458995493266767, 'multiple')).toMatch(/^2\.75x$/);
    expect(formatNumber(1.2, 'multiple')).toBe('1.2x');
  });

  it('currency negatives render in parentheses (the accounting convention)', () => {
    const out = formatNumber(-1234, 'currency');
    expect(out).toMatch(/1,?234/);      // grouped magnitude
    expect(out).toMatch(/[()]/);        // parenthesized negative
    expect(out).not.toMatch(/-/);
  });

  it('thousands separators are on (locale-default grouping)', () => {
    expect(formatNumber(1234567.891, 'number')).toMatch(/1[,.]234[,.]567/);
  });

  it('a unit suffix rides after the number', () => {
    expect(formatNumber(370.16, 'number', 'EUR m')).toBe(`${NF(370.16)} EUR m`);
    expect(formatNumber(2.75, 'multiple', 'MOIC')).toBe('2.75x MOIC');
  });

  it('formatScalar threads format + unit for numbers only', () => {
    expect(formatScalar(46.27, 'number', 'EUR m')).toMatch(/46\.27 EUR m/);
    expect(formatScalar('all', 'number', 'EUR m')).toBe('all');
    expect(formatScalar(null, 'number', 'EUR m')).toBe('—');
  });
});

function NF(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}
