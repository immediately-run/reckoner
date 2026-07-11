import { describe, it, expect } from 'vitest';
import {
  monthKey,
  truncate,
  addMonths,
  addDays,
  monthsBetween,
  fiscalPeriod,
  resolveRange,
} from './dates.ts';

describe('monthKey / truncate', () => {
  it('extracts YYYY-MM from various inputs', () => {
    expect(monthKey('2026-06-14')).toBe('2026-06');
    expect(monthKey('2026-06')).toBe('2026-06');
    expect(monthKey(new Date(Date.UTC(2026, 5, 14)))).toBe('2026-06');
  });

  it('truncates to unit', () => {
    expect(truncate('2026-06-14', 'year')).toBe('2026');
    expect(truncate('2026-06-14', 'month')).toBe('2026-06');
    expect(truncate('2026-06-14', 'day')).toBe('2026-06-14');
  });

  it('rejects garbage input', () => {
    expect(() => monthKey('not-a-date')).toThrow();
  });
});

describe('addMonths — granularity preserving + clamping', () => {
  it('shifts a month key and stays a month key', () => {
    expect(addMonths('2024-01', 1)).toBe('2024-02');
    expect(addMonths('2024-01', 12)).toBe('2025-01');
    expect(addMonths('2024-03', -4)).toBe('2023-11');
  });

  it('clamps the day to the target month length', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // leap
    expect(addMonths('2023-01-31', 1)).toBe('2023-02-28');
  });
});

describe('addDays / monthsBetween', () => {
  it('addDays crosses month and year boundaries in UTC', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('monthsBetween counts whole months signed', () => {
    expect(monthsBetween('2026-01', '2026-06')).toBe(5);
    expect(monthsBetween('2026-06', '2026-01')).toBe(-5);
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
  });
});

describe('fiscalPeriod', () => {
  it('calendar year by default', () => {
    expect(fiscalPeriod('2026-02-10')).toMatchObject({ fiscalYear: 2026, quarter: 1 });
    expect(fiscalPeriod('2026-11-10')).toMatchObject({ fiscalYear: 2026, quarter: 4 });
  });

  it('April fiscal start rolls the year at the boundary', () => {
    expect(fiscalPeriod('2026-03-31', { startMonth: 4 })).toMatchObject({
      fiscalYear: 2025,
      quarter: 4,
      label: 'FY2025 Q4',
    });
    expect(fiscalPeriod('2026-04-01', { startMonth: 4 })).toMatchObject({
      fiscalYear: 2026,
      quarter: 1,
      label: 'FY2026 Q1',
    });
  });
});

describe('resolveRange (explicit now)', () => {
  it('last-Nd is the N days ending on now, inclusive', () => {
    expect(resolveRange('last-90d', '2026-06-30')).toEqual({
      start: '2026-04-02',
      end: '2026-06-30',
    });
    expect(resolveRange('last-1d', '2026-06-30')).toEqual({
      start: '2026-06-30',
      end: '2026-06-30',
    });
  });

  it('last-Nm spans whole months ending in now-month', () => {
    expect(resolveRange('last-12m', '2026-06-15')).toEqual({
      start: '2025-07-01',
      end: '2026-06-15',
    });
  });

  it('ytd / mtd / qtd', () => {
    expect(resolveRange('ytd', '2026-06-15')).toEqual({ start: '2026-01-01', end: '2026-06-15' });
    expect(resolveRange('mtd', '2026-06-15')).toEqual({ start: '2026-06-01', end: '2026-06-15' });
    expect(resolveRange('qtd', '2026-06-15')).toEqual({ start: '2026-04-01', end: '2026-06-15' });
    expect(resolveRange('qtd', '2026-02-15')).toEqual({ start: '2026-01-01', end: '2026-02-15' });
  });

  it('unknown spec throws (no silent surprise window)', () => {
    expect(() => resolveRange('everything', '2026-06-15')).toThrow();
  });
});
