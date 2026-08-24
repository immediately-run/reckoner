// Windowed-feed input resolution (ARCHITECTURE_PLAN §3 "Feeds and time", §4.1). The slice
// is computed by the shared resolver both engines use, so these tests drive the synchronous
// `Scheduler` directly: `feedBuffers.<feed>` externals + a declared window in, event-time
// slice + folded tier out. The clock rule under test: `params.now` when the workbook
// declares it, else the newest retained event time — never an ambient clock.

import { describe, it, expect } from 'vitest';
import { cell } from '../stdlib/index.ts';
import type { Row, Value } from '../stdlib/types.ts';
import { buildGraph } from './graph.ts';
import { Scheduler } from './scheduler.ts';
import type { Evaluator } from './scheduler.ts';
import type { Workbook } from './types.ts';

/** Pass the resolved inputs straight through to the declared formula. */
const evalFormula: Evaluator = (node, inputs) =>
  (node.def as { formula: (i: Record<string, Value>) => Value }).formula(inputs);

const T0 = 1_700_000_000_000;

function rows(...specs: [string, number][]): Row[] {
  return specs.map(([region, ts]) => ({ region, ts }));
}

function windowedWorkbook(by?: string): Workbook {
  const input = by === undefined ? { feed: 'orders', window: '1h' } : { feed: 'orders', window: '1h', by };
  return {
    live: {
      tail: cell({
        doc: 'windowed tail',
        inputs: { recent: input },
        formula: ({ recent }) => (Array.isArray(recent) ? recent : []),
      }),
    },
  };
}

function run(externals: Parameters<Scheduler['initial']>[0]) {
  const s = new Scheduler(buildGraph(windowedWorkbook()));
  s.initial(externals, evalFormula);
  return s;
}

describe('windowed-feed resolution', () => {
  it('slices by event time against a declared params.now', () => {
    const s = run({
      'feedBuffers.orders': { value: rows(['emea', T0], ['amer', T0 - 30 * 60_000], ['apac', T0 - 2 * 3_600_000]), tier: 'live' },
      'params.now': { value: T0, tier: 'static' },
    });
    expect(s.result('live.tail')!.value).toEqual(rows(['emea', T0], ['amer', T0 - 30 * 60_000]));
    expect(s.result('live.tail')!.tier).toBe('live'); // the feed's tier folds through the window
  });

  it('falls back to the newest retained event time when no params.now is declared', () => {
    const s = run({
      'feedBuffers.orders': { value: rows(['emea', T0], ['apac', T0 - 2 * 3_600_000]), tier: 'live' },
    });
    // now = T0 (newest event) → the 2h-old row is outside the trailing 1h window
    expect(s.result('live.tail')!.value).toEqual(rows(['emea', T0]));
  });

  it('an absent buffer resolves to an empty slice, not an error', () => {
    const s = run({});
    expect(s.result('live.tail')!.value).toEqual([]);
  });

  it('an unusable params.now degrades to the newest event time, not a throw', () => {
    const s = run({
      'feedBuffers.orders': { value: rows(['emea', T0]), tier: 'live' },
      'params.now': { value: 'not a date', tier: 'static' },
    });
    expect(s.result('live.tail')!.value).toEqual(rows(['emea', T0]));
  });

  it('rows without a usable event time drop out of the window (never throw)', () => {
    const bad: Row[] = [
      { region: 'noTs' }, // absent by
      { region: 'garbage', ts: 'not a date' }, // present but unparseable
      { region: 'bool', ts: true },
      { region: 'ok', ts: T0 },
    ];
    const s = run({
      'feedBuffers.orders': { value: bad, tier: 'live' },
      'params.now': { value: T0, tier: 'static' },
    });
    expect(s.result('live.tail')!.value).toEqual([{ region: 'ok', ts: T0 }]);
  });

  it('honors an explicit by field', () => {
    const s = new Scheduler(buildGraph(windowedWorkbook('event_at')));
    s.initial(
      { 'feedBuffers.orders': { value: [{ region: 'a', event_at: T0 }, { region: 'b', ts: T0 }], tier: 'live' } },
      evalFormula,
    );
    expect(s.result('live.tail')!.value).toEqual([{ region: 'a', event_at: T0 }]);
  });

  it('a buffer change recomputes the cell; a params.now change advances the window', () => {
    const s = run({
      'feedBuffers.orders': { value: rows(['emea', T0 - 40 * 60_000]), tier: 'live' },
      'params.now': { value: T0, tier: 'static' },
    });
    expect(s.result('live.tail')!.value).toEqual(rows(['emea', T0 - 40 * 60_000]));

    // the clock moves on: with no new events, the trailing window slides past the old row
    const slide = s.apply({ 'params.now': { value: T0 + 30 * 60_000, tier: 'static' } }, evalFormula);
    expect(slide.recomputed).toContain('live.tail');
    expect(s.result('live.tail')!.value).toEqual([]);

    // a new frame lands inside the window
    const landed = s.apply(
      { 'feedBuffers.orders': { value: rows(['emea', T0 - 40 * 60_000], ['amer', T0 + 30 * 60_000]), tier: 'live' } },
      evalFormula,
    );
    expect(landed.recomputed).toContain('live.tail');
    expect(s.result('live.tail')!.value).toEqual(rows(['amer', T0 + 30 * 60_000]));
  });
});
