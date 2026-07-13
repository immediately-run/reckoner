import { describe, expect, it } from 'vitest';
import { RetentionBuffer } from './buffer.ts';
import { window } from '../stdlib/window.ts';

describe('RetentionBuffer', () => {
  it('keeps the snapshot as the newest data frame', () => {
    const b = new RetentionBuffer();
    b.append([{ v: 1 }], 1000);
    b.append([{ v: 2 }], 2000);
    expect(b.latest()?.rows).toEqual([{ v: 2 }]);
  });

  it('prunes by keepLast (most-recent frames)', () => {
    const b = new RetentionBuffer({ keepLast: 2 });
    b.append([{ v: 1 }], 1000);
    b.append([{ v: 2 }], 2000);
    b.append([{ v: 3 }], 3000);
    expect(b.size()).toBe(2);
    expect(b.frames().map((f) => f.rows[0].v)).toEqual([2, 3]);
  });

  it('prunes by keepFor (trailing age from the newest receipt)', () => {
    const b = new RetentionBuffer({ keepFor: '1h' });
    b.append([{ v: 1 }], 0);
    b.append([{ v: 2 }], 30 * 60_000); // +30m
    b.append([{ v: 3 }], 90 * 60_000); // +90m → frame@0 is now >1h old, evicted
    expect(b.frames().map((f) => f.rows[0].v)).toEqual([2, 3]);
  });

  it('content-addresses frames (equal rows → equal id)', () => {
    const b = new RetentionBuffer();
    const a = b.append([{ v: 1 }], 1000);
    const c = b.append([{ v: 1 }], 2000);
    expect(a.id).toBe(c.id); // same content → same versioned id
  });

  it('retained rows feed an event-time window()', () => {
    const b = new RetentionBuffer({ keepFor: '2h' });
    b.append([{ t: 1000, x: 'a' }], 1000);
    b.append([{ t: 2000, x: 'b' }], 2000);
    b.append([{ t: 3000, x: 'c' }], 3000);
    const recent = window(b.rows(), { by: 't', within: '1s', now: 3000 });
    expect(recent.map((r) => r.x)).toEqual(['b', 'c']); // t in [2000, 3000]
  });

  it('marks a gap so a spanning window is reported partial', () => {
    const b = new RetentionBuffer();
    b.append([{ v: 1 }], 1000);
    b.markGap(1500); // reconnect
    b.append([{ v: 2 }], 2000);
    expect(b.hasGapWithin(2000, 1500)).toBe(true); // gap at 1500 is within [500, 2000]
    expect(b.hasGapWithin(2000, 400)).toBe(false); // gap outside [1600, 2000]
    expect(b.latest()?.rows).toEqual([{ v: 2 }]); // a gap is never the snapshot
  });

  it('rejects an invalid keepLast', () => {
    expect(() => new RetentionBuffer({ keepLast: 0 })).toThrow(/positive integer/);
  });
});
