// The usage feeds (R3-349): the rollup connector's row mapping, the meta feed's
// aggregated fetch outcomes, the immediate first tick, and the skip-on-failure
// semantics — all offline, with the egress leg injected.

import { describe, expect, it } from 'vitest';
import { rollupWindow, usageFeedSpecs, USAGE_META_FEED, USAGE_ROLLUPS } from './usageFeeds.ts';
import type { RollupReply } from './usageFeeds.ts';
import type { ConnectorSink } from '../feed/connector.ts';
import type { Row } from '../stdlib/types.ts';

const T0 = Date.parse('2026-08-28T12:00:00Z');

/** A deterministic scheduler: captures tasks; `runAll` fires everything pending once. */
function fakeScheduler(): {
  schedule: (fn: () => void, ms: number) => () => void;
  delays: number[];
  runAll: () => void;
} {
  let pending: { fn: () => void; cancelled: boolean }[] = [];
  const delays: number[] = [];
  return {
    delays,
    schedule: (fn, ms) => {
      delays.push(ms);
      const task = { fn, cancelled: false };
      pending.push(task);
      return () => {
        task.cancelled = true;
      };
    },
    runAll: () => {
      const batch = pending;
      pending = [];
      for (const t of batch) if (!t.cancelled) t.fn();
    },
  };
}

function capture(): { sink: ConnectorSink; frames: Row[][] } {
  const frames: Row[][] = [];
  return { sink: { frame: (rows) => void frames.push(rows), gap: () => {} }, frames };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('rollupWindow', () => {
  it('builds an inclusive UTC window ending today', () => {
    expect(rollupWindow(T0, 28)).toEqual({ from: '2026-08-01', to: '2026-08-28' });
    expect(rollupWindow(T0, 1)).toEqual({ from: '2026-08-28', to: '2026-08-28' });
  });
});

describe('usageFeedSpecs', () => {
  it('declares the five rollup feeds plus the meta feed, all pulled', () => {
    const specs = usageFeedSpecs({ fetchRollup: async () => ({ ok: false, code: 'network' }) });
    expect(specs.map((s) => s.name)).toEqual([...USAGE_ROLLUPS.map((r) => r.feed), USAGE_META_FEED]);
    expect(specs.every((s) => s.tier === 'pulled')).toBe(true);
  });

  it('maps served cells to flat rows and reports the fetch in the meta feed', async () => {
    const sched = fakeScheduler();
    const queries: { rollup: string; from: string; to: string }[] = [];
    const reply: RollupReply = {
      ok: true,
      cells: [
        { key: { day: '2026-08-27', name: 'immediately-run/reckoner' }, count: 41 },
        { key: { day: '2026-08-28', name: 'immediately-run/grove' }, count: 25 },
      ],
      suppressed: 3,
      kFloor: 20,
    };
    const specs = usageFeedSpecs({
      fetchRollup: async (q) => {
        queries.push(q);
        return reply;
      },
      now: () => T0,
      schedule: sched.schedule,
      intervalMs: 1000,
    });

    const meta = capture();
    specs.find((s) => s.name === USAGE_META_FEED)!.connector.start(meta.sink);
    const repos = capture();
    const stopRepos = specs.find((s) => s.name === 'repos_daily')!.connector.start(repos.sink);

    // The first tick is immediate — pollingConnector's default would wait a full
    // interval, which is wrong for a 5-minute poll.
    expect(sched.delays[0]).toBe(0);
    sched.runAll();
    await settle();

    expect(queries).toEqual([{ rollup: 'repos.daily', from: '2026-08-01', to: '2026-08-28' }]);
    expect(repos.frames).toEqual([
      [
        { day: '2026-08-27', name: 'immediately-run/reckoner', count: 41 },
        { day: '2026-08-28', name: 'immediately-run/grove', count: 25 },
      ],
    ]);
    const metaRows = meta.frames.at(-1)!;
    expect(metaRows).toEqual([
      {
        rollup: 'repos.daily',
        status: 'ok',
        cells: 2,
        suppressed: 3,
        kFloor: 20,
        from: '2026-08-01',
        to: '2026-08-28',
      },
    ]);

    // The next tick is scheduled at the real interval.
    expect(sched.delays.at(-1)).toBe(1000);
    stopRepos();
  });

  it('a failed fetch delivers no data frame but refreshes the meta status', async () => {
    const sched = fakeScheduler();
    const specs = usageFeedSpecs({
      fetchRollup: async () => ({ ok: false, code: 'forbidden' }),
      now: () => T0,
      schedule: sched.schedule,
      intervalMs: 1000,
    });

    const meta = capture();
    specs.find((s) => s.name === USAGE_META_FEED)!.connector.start(meta.sink);
    const llm = capture();
    specs.find((s) => s.name === 'llm_daily')!.connector.start(llm.sink);

    sched.runAll();
    await settle();

    expect(llm.frames).toEqual([]); // skip semantics: the last good snapshot stays
    const metaRows = meta.frames.at(-1)!;
    expect(metaRows).toHaveLength(1);
    expect(metaRows[0]).toMatchObject({ rollup: 'llm.daily', status: 'forbidden', cells: 0 });
  });

  it('the meta snapshot covers every rollup that has fetched, not just the latest', async () => {
    const sched = fakeScheduler();
    const specs = usageFeedSpecs({
      fetchRollup: async (q) =>
        q.rollup === 'repos.daily'
          ? { ok: true, cells: [], suppressed: 0, kFloor: 20 }
          : { ok: false, code: 'http-503' },
      now: () => T0,
      schedule: sched.schedule,
      intervalMs: 1000,
    });

    const meta = capture();
    specs.find((s) => s.name === USAGE_META_FEED)!.connector.start(meta.sink);
    for (const name of ['repos_daily', 'geography_daily']) {
      specs.find((s) => s.name === name)!.connector.start(capture().sink);
    }

    sched.runAll();
    await settle();

    const metaRows = meta.frames.at(-1)!;
    expect(metaRows.map((r) => [r.rollup, r.status])).toEqual([
      ['repos.daily', 'ok'],
      ['geography.daily', 'http-503'],
    ]);
  });
});
