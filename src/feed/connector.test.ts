import { describe, expect, it } from 'vitest';
import { manualConnector, pollingConnector } from './connector.ts';
import type { ConnectorSink } from './connector.ts';
import type { Row } from '../stdlib/types.ts';

function recorder(): ConnectorSink & { frames: { rows: Row[]; at: number }[]; gaps: number[] } {
  const frames: { rows: Row[]; at: number }[] = [];
  const gaps: number[] = [];
  return { frames, gaps, frame: (rows, at) => frames.push({ rows, at }), gap: (at) => gaps.push(at) };
}

describe('manualConnector', () => {
  it('delivers pushed frames and gaps to the started sink, and stops', () => {
    const c = manualConnector();
    const sink = recorder();
    const stop = c.start(sink);
    c.push([{ v: 1 }], 1000);
    c.gap(1500);
    c.push([{ v: 2 }], 2000);
    stop();
    c.push([{ v: 3 }], 3000); // after stop → dropped
    expect(sink.frames.map((f) => f.rows[0].v)).toEqual([1, 2]);
    expect(sink.gaps).toEqual([1500]);
  });
});

describe('pollingConnector', () => {
  // Run the currently-armed tick and let its async fetch chain settle + re-arm the next timer.
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it('fetches a frame per scheduled tick', async () => {
    const timers: (() => void)[] = [];
    const schedule = (fn: () => void): (() => void) => {
      timers.push(fn);
      return () => {};
    };
    let n = 0;
    const c = pollingConnector({ fetchFrame: async () => [{ n: ++n }], intervalMs: 1000, now: () => 0, schedule });
    const sink = recorder();
    c.start(sink);
    for (let i = 0; i < 3; i++) {
      timers.pop()!(); // the armed tick
      await settle(); // fetch → deliver → re-arm
    }
    expect(sink.frames).toHaveLength(3);
    expect(sink.frames[0].rows[0].n).toBe(1);
  });

  it('skips a failed fetch and keeps polling', async () => {
    const timers: (() => void)[] = [];
    const schedule = (fn: () => void): (() => void) => {
      timers.push(fn);
      return () => {};
    };
    let call = 0;
    const c = pollingConnector({
      fetchFrame: async () => {
        if (++call === 1) throw new Error('network');
        return [{ ok: true }];
      },
      intervalMs: 1000,
      now: () => 0,
      schedule,
    });
    const sink = recorder();
    c.start(sink);
    for (let i = 0; i < 2; i++) {
      timers.pop()!();
      await settle();
    }
    expect(sink.frames).toHaveLength(1); // only the successful poll produced a frame
  });
});
