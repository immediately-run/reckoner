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
