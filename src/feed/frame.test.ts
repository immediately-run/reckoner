import { describe, expect, it } from 'vitest';
import { frame, gapFrame } from './frame.ts';

describe('frame', () => {
  it('content-addresses a data frame (order-sensitive to the rows)', () => {
    const a = frame([{ v: 1 }, { v: 2 }], 1000);
    const b = frame([{ v: 1 }, { v: 2 }], 9999); // different receipt time, same rows
    expect(a.id).toBe(b.id); // id is content-addressed, not time-addressed
    expect(a.id.startsWith('f:')).toBe(true);
    expect(a.gap).toBe(false);
    const c = frame([{ v: 2 }, { v: 1 }], 1000);
    expect(c.id).not.toBe(a.id); // different content → different id
  });

  it('makes a gap marker carrying no rows', () => {
    const g = gapFrame(1500);
    expect(g.gap).toBe(true);
    expect(g.rows).toEqual([]);
    expect(g.id).toBe('gap:1500');
  });
});
