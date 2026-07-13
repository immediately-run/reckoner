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
