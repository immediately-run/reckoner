import { describe, expect, it } from 'vitest';
import { FeedRuntime } from './runtime.ts';
import { manualConnector } from './connector.ts';
import { AsyncEngine } from '../engine/asyncEngine.ts';
import { inMemoryTransport } from '../engine/workerTransport.ts';
import type { ExternalValue } from '../engine/types.ts';

function fakeEngine(): { updates: Record<string, ExternalValue>[]; update: (d: Record<string, ExternalValue>) => Promise<void> } {
  const updates: Record<string, ExternalValue>[] = [];
  return { updates, update: async (d) => void updates.push(d) };
}

describe('FeedRuntime', () => {
  it('coalesces a burst into one engine update with the latest snapshot', () => {
    const engine = fakeEngine();
    const conn = manualConnector();
    const flushes: (() => void)[] = [];
    const rt = new FeedRuntime([{ name: 'ticks', connector: conn, tier: 'live' }], {
      engine,
      scheduleFlush: (fn) => flushes.push(fn),
    });
    rt.start();

    conn.push([{ v: 1 }], 1000);
    conn.push([{ v: 2 }], 2000);
    conn.push([{ v: 3 }], 3000);
    expect(flushes).toHaveLength(1); // one scheduled flush for the whole burst

    flushes.shift()!();
    expect(engine.updates).toHaveLength(1);
    expect(engine.updates[0]['feeds.ticks']).toEqual({ value: [{ v: 3 }], tier: 'live' }); // latest snapshot
  });

  it('publishes the retained rows alongside the snapshot (buffer + windowed externals)', () => {
    const engine = fakeEngine();
    const conn = manualConnector();
    const rt = new FeedRuntime([{ name: 'ticks', connector: conn, tier: 'live', retention: { keepFor: '1h' } }], {
      engine,
      scheduleFlush: (fn) => fn(),
    });
    rt.start();

    expect(rt.initialExternals()).toEqual({ 'feedBuffers.ticks': { value: [], tier: 'live' } }); // empty buffer, cold run

    conn.push([{ v: 1, ts: 1000 }], 1000);
    conn.push([{ v: 2, ts: 2000 }], 2000);
    expect(engine.updates).toHaveLength(2);
    // snapshot = newest frame only; buffer = every retained row (what windowed inputs slice)
    expect(engine.updates[1]['feeds.ticks']).toEqual({ value: [{ v: 2, ts: 2000 }], tier: 'live' });
    expect(engine.updates[1]['feedBuffers.ticks']).toEqual({
      value: [{ v: 1, ts: 1000 }, { v: 2, ts: 2000 }],
      tier: 'live',
    });
  });

  it('marks a buffer gap on a discontinuity without changing the snapshot', () => {
    const engine = fakeEngine();
    const conn = manualConnector();
    const rt = new FeedRuntime([{ name: 'ticks', connector: conn, retention: { keepFor: '1h' } }], {
      engine,
      scheduleFlush: (fn) => fn(),
    });
    rt.start();
    conn.push([{ v: 1 }], 1000);
    conn.gap(1500);
    expect(rt.buffer('ticks')?.hasGapWithin(2000, 1500)).toBe(true);
    expect(rt.buffer('ticks')?.latest()?.rows).toEqual([{ v: 1 }]); // gap is never the snapshot
  });

  it('drives a live recompute of the real engine (feed → feeds.* external → cell)', async () => {
    const sources = {
      live: `import { cell } from "@reckoner/stdlib";
export const count = cell({ doc: "live row count", inputs: { rows: "feeds.ticks" }, formula: ({ rows }) => (Array.isArray(rows) ? rows.length : 0) });
`,
    };
    const engine = await AsyncEngine.fromSources(sources, { transport: inMemoryTransport() });
    await engine.run({}); // no feed yet
    expect(engine.value('live.count')).toBe(0);

    const conn = manualConnector();
    const flushes: (() => void)[] = [];
    let settled!: () => void;
    const rt = new FeedRuntime([{ name: 'ticks', connector: conn, tier: 'live' }], {
      engine,
      scheduleFlush: (fn) => flushes.push(fn),
      onSettled: () => settled(),
    });
    rt.start();

    const recomputed = new Promise<void>((r) => (settled = r));
    conn.push([{ a: 1 }, { a: 2 }, { a: 3 }], 1000);
    flushes.shift()!();
    await recomputed;

    expect(engine.value('live.count')).toBe(3); // the live feed recomputed the cell
    expect(engine.result('live.count')?.tier).toBe('live'); // feed tier folded through
    rt.stop();
  });
});

describe('FeedRuntime — windowed inputs (real engine)', () => {
  it('a { feed, window } cell recomputes over the retained buffer as frames arrive', async () => {
    const sources = {
      live: `import { cell } from "@reckoner/stdlib";
export const recent = cell({ doc: "events in the trailing window", inputs: { tail: { feed: "ticks", window: "10s" } }, formula: ({ tail }) => (Array.isArray(tail) ? tail.length : 0) });
`,
    };
    const engine = await AsyncEngine.fromSources(sources, { transport: inMemoryTransport() });
    await engine.run({});
    expect(engine.value('live.recent')).toBe(0); // no buffer yet → empty slice

    const conn = manualConnector();
    const flushes: (() => void)[] = [];
    let settled!: () => void;
    const rt = new FeedRuntime([{ name: 'ticks', connector: conn, tier: 'live' }], {
      engine,
      scheduleFlush: (fn) => flushes.push(fn),
      onSettled: () => settled(),
    });
    rt.start();

    const recompute = (): Promise<void> => new Promise<void>((r) => (settled = r));
    const tick = recompute();
    conn.push([{ v: 1, ts: 1000 }, { v: 2, ts: 5000 }], 5000); // both inside [0s,10s] of newest
    flushes.shift()!();
    await tick;
    expect(engine.value('live.recent')).toBe(2);
    expect(engine.result('live.recent')?.tier).toBe('live'); // feed tier folds through the window

    // a later frame makes the earlier rows fall outside the trailing window
    const tick2 = recompute();
    conn.push([{ v: 3, ts: 20_000 }], 20_000); // now = 20s → window [10s,20s]: only ts=20s
    flushes.shift()!();
    await tick2;
    expect(engine.value('live.recent')).toBe(1);
    rt.stop();
  });
});
