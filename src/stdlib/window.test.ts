import { describe, it, expect } from 'vitest';
import { window, parseDuration } from './window.ts';
import type { Row } from './types.ts';

describe('parseDuration', () => {
  it('parses each unit to milliseconds', () => {
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('5m')).toBe(300_000);
    expect(parseDuration('1h')).toBe(3_600_000);
    expect(parseDuration('7d')).toBe(604_800_000);
    expect(parseDuration('1w')).toBe(604_800_000);
  });

  it('throws on garbage', () => {
    expect(() => parseDuration('soon')).toThrow();
    expect(() => parseDuration('1y')).toThrow();
  });
});

describe('window — event-time slice', () => {
  const events: Row[] = [
    { at: '2026-06-14T09:00:00Z', id: 1 },
    { at: '2026-06-14T09:45:00Z', id: 2 },
    { at: '2026-06-14T10:00:00Z', id: 3 },
    { at: '2026-06-14T08:30:00Z', id: 4 },
  ];

  it('keeps events within the trailing duration ending at now (inclusive)', () => {
    const out = window(events, { by: 'at', within: '1h', now: '2026-06-14T10:00:00Z' });
    // [09:00, 10:00]: ids 1, 2, 3 (08:30 is out)
    expect(out.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('accepts epoch-ms timestamps too', () => {
    const ms: Row[] = [{ at: 1000, id: 'a' }, { at: 5000, id: 'b' }, { at: 9000, id: 'c' }];
    const out = window(ms, { by: 'at', within: '4s', now: 9000 });
    expect(out.map((e) => e.id)).toEqual(['b', 'c']); // [5000, 9000]
  });

  it('drops events with an absent timestamp; preserves order', () => {
    const out = window([{ at: null, id: 1 }, { at: '2026-06-14T09:59:00Z', id: 2 }], {
      by: 'at',
      within: '1h',
      now: '2026-06-14T10:00:00Z',
    });
    expect(out.map((e) => e.id)).toEqual([2]);
  });
});
