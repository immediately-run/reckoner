import { describe, it, expect } from 'vitest';
import { cell } from '../stdlib/index.ts';
import { buildGraph } from './graph.ts';
import { Scheduler, CycleError } from './scheduler.ts';
import type { Evaluator } from './scheduler.ts';
import type { Workbook } from './types.ts';

const noop = () => null;

// data.raw ← feeds.orders ; data.doubled ← raw ; data.isPositive ← raw
// report.headline ← doubled + params.region ; report.flag ← isPositive
const workbook: Workbook = {
  data: {
    raw: cell({ doc: 'raw', inputs: { src: 'feeds.orders' }, formula: noop }),
    doubled: cell({ doc: 'doubled', inputs: { r: 'data.raw' }, formula: noop }),
    isPositive: cell({ doc: 'sign', inputs: { r: 'data.raw' }, formula: noop }),
  },
  report: {
    headline: cell({ doc: 'h', inputs: { d: 'data.doubled', region: 'params.region' }, formula: noop }),
    flag: cell({ doc: 'flag', inputs: { p: 'data.isPositive' }, formula: noop }),
  },
};

const evalFn: Evaluator = (node, inputs) => {
  switch (node.id) {
    case 'data.raw':
      return inputs.src;
    case 'data.doubled':
      return (inputs.r as number) * 2;
    case 'data.isPositive':
      return (inputs.r as number) > 0;
    case 'report.headline':
      return `${inputs.region}:${inputs.d}`;
    case 'report.flag':
      return inputs.p ? 'ok' : 'bad';
    default:
      return null;
  }
};

function fresh(): Scheduler {
  const s = new Scheduler(buildGraph(workbook));
  s.initial(
    { 'feeds.orders': { value: 5, tier: 'live' }, 'params.region': { value: 'EU', tier: 'static' } },
    evalFn,
  );
  return s;
}

describe('Scheduler — cold build', () => {
  it('computes every node with folded tiers', () => {
    const s = fresh();
    expect(s.result('data.raw')).toMatchObject({ value: 5, tier: 'live' });
    expect(s.result('data.doubled')).toMatchObject({ value: 10, tier: 'live' });
    expect(s.result('report.headline')).toMatchObject({ value: 'EU:10', tier: 'live' }); // live ∧ static = live
    expect(s.result('report.flag')).toMatchObject({ value: 'ok', tier: 'live' });
  });
});

describe('Scheduler — incremental cutoff (F5)', () => {
  it('a param change recomputes only its dependents', () => {
    const s = fresh();
    const pass = s.apply({ 'params.region': { value: 'US', tier: 'static' } }, evalFn);
    expect(pass.recomputed).toEqual(['report.headline']);
    expect(s.result('report.headline')!.value).toBe('US:10');
  });

  it('an unchanged external (same value + tier) recomputes nothing', () => {
    const s = fresh();
    const pass = s.apply({ 'feeds.orders': { value: 5, tier: 'live' } }, evalFn);
    expect(pass.recomputed).toEqual([]);
  });

  it('value cutoff prunes a subtree whose value did not change', () => {
    const s = fresh();
    // 5 → 7: raw/doubled change, but isPositive stays true → report.flag is pruned.
    const pass = s.apply({ 'feeds.orders': { value: 7, tier: 'live' } }, evalFn);
    expect(pass.recomputed).toContain('data.isPositive'); // recomputed (its input changed)
    expect(pass.changed).not.toContain('data.isPositive'); // but its (value,tier) did not change
    expect(pass.recomputed).not.toContain('report.flag'); // so its dependent is never touched
    expect(pass.changed).toEqual(expect.arrayContaining(['data.raw', 'data.doubled', 'report.headline']));
  });
});

describe('Scheduler — the (value, tier) pair rule (F4/RQ-B4)', () => {
  it('a tier-only change re-labels downstream even when every value is identical', () => {
    const s = fresh();
    // same value (5), tier live → pulled: nothing's value changes, but the tier must propagate.
    const pass = s.apply({ 'feeds.orders': { value: 5, tier: 'pulled' } }, evalFn);
    // report.flag IS touched now (isPositive's tier changed), unlike the value-cutoff case.
    expect(pass.recomputed).toContain('report.flag');
    expect(pass.changed).toContain('data.isPositive');
    expect(s.result('data.raw')!.tier).toBe('pulled');
    expect(s.result('report.flag')).toMatchObject({ value: 'ok', tier: 'pulled' });
  });
});

describe('Scheduler — wildcard selector resolution', () => {
  const wb: Workbook = {
    revenue: {
      by_month: cell({ doc: 'm', inputs: { s: 'feeds.x' }, formula: noop }),
      total: cell({ doc: 't', inputs: { m: 'revenue.by_month' }, formula: noop }),
    },
    metrics: {
      focus: cell({ doc: 'f', inputs: { which: 'params.metric', candidates: 'revenue.*' }, formula: noop }),
    },
  };
  const evalWb: Evaluator = (node, inputs) => {
    switch (node.id) {
      case 'revenue.by_month':
        return inputs.s;
      case 'revenue.total':
        return (inputs.m as number) + 1000;
      case 'metrics.focus':
        return (inputs.candidates as Record<string, number>)[inputs.which as string];
      default:
        return null;
    }
  };

  it('resolves candidates[which] over the declared namespace', () => {
    const s = new Scheduler(buildGraph(wb));
    s.initial({ 'feeds.x': { value: 5, tier: 'static' }, 'params.metric': { value: 'total', tier: 'static' } }, evalWb);
    expect(s.result('metrics.focus')!.value).toBe(1005);

    const pass = s.apply({ 'params.metric': { value: 'by_month', tier: 'static' } }, evalWb);
    expect(pass.recomputed).toEqual(['metrics.focus']);
    expect(s.result('metrics.focus')!.value).toBe(5);
  });
});

describe('Scheduler — cycles are an error', () => {
  it('throws CycleError on initial() for a cyclic workbook', () => {
    const s = new Scheduler(
      buildGraph({
        w: {
          a: cell({ doc: 'a', inputs: { b: 'w.b' }, formula: noop }),
          b: cell({ doc: 'b', inputs: { a: 'w.a' }, formula: noop }),
        },
      }),
    );
    expect(s.cycles).toHaveLength(1);
    expect(() => s.initial({}, evalFn)).toThrow(CycleError);
  });
});
