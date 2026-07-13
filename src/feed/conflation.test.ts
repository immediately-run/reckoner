import { describe, expect, it } from 'vitest';
import { Conflator } from './conflation.ts';

describe('Conflator', () => {
  it('keeps the latest value per key across a burst', () => {
    const c = new Conflator<number>();
    c.write('params.k', 1);
    c.write('params.k', 2);
    c.write('params.k', 3);
    const batch = c.flush();
    expect(batch.get('params.k')).toBe(3); // kept-latest
    expect(c.coalesced()).toBe(2); // two writes superseded
  });

  it('coalesces feeds and params into one batch (shared backpressure)', () => {
    const c = new Conflator<unknown>();
    c.write('feeds.orders', [{ id: 1 }]);
    c.write('params.region', 'emea');
    c.write('feeds.orders', [{ id: 2 }]); // supersedes the first feed write
    const batch = c.flush();
    expect(batch.size).toBe(2);
    expect(batch.get('feeds.orders')).toEqual([{ id: 2 }]);
    expect(batch.get('params.region')).toBe('emea');
  });

  it('clears pending on flush — one recompute per flush', () => {
    const c = new Conflator<number>();
    c.write('a', 1);
    expect(c.hasPending()).toBe(true);
    c.flush();
    expect(c.hasPending()).toBe(false);
    expect(c.flush().size).toBe(0); // nothing new
  });
});
