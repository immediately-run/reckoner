import { describe, it, expect } from 'vitest';
import * as stdlib from '../stdlib/index.ts';
import { Engine } from './engine.ts';
import type { Row } from '../stdlib/types.ts';

// Two worksheets + a metamorphic test, all as transpiled worksheet source — the whole spine
// end to end: SES-confined evaluation → graph → scheduler → results → tests → verdict.
const SOURCES: Record<string, string> = {
  revenue: `
    import { cell, testCell, table, sum, permutationInvariance } from "@reckoner/stdlib";

    export const by_month = cell({
      doc: "revenue by month",
      inputs: { orders: "feeds.orders" },
      formula: ({ orders }) => table(orders).groupBy("month").rollup({ revenue: sum("eur") }).rows(),
    });

    export const total = cell({
      doc: "total revenue",
      inputs: { m: "revenue.by_month" },
      formula: ({ m }) => m.reduce((a, r) => a + r.revenue, 0),
    });

    export const by_month_order_free = testCell({
      kind: "metamorphic",
      subject: "revenue.by_month",
      inputs: { orders: "feeds.orders" },
      relation: permutationInvariance({ over: "orders" }),
    });
  `,
  summary: `
    import { cell } from "@reckoner/stdlib";
    export const months = cell({
      doc: "distinct months",
      inputs: { m: "revenue.by_month" },
      formula: ({ m }) => m.length,
    });
  `,
};

const orders: Row[] = [
  { month: '2026-01', eur: 100 },
  { month: '2026-02', eur: 50 },
  { month: '2026-01', eur: 40 },
];

describe('Engine — end to end over the whole spine', () => {
  it('runs worksheets through SES → graph → scheduler and publishes cell values', () => {
    const engine = Engine.fromSources(SOURCES, stdlib);
    expect(engine.graph.diagnostics).toEqual([]);
    expect(engine.scheduler.cycles).toEqual([]);

    engine.run({ 'feeds.orders': { value: orders, tier: 'live' } });

    expect(engine.value('revenue.by_month')).toEqual([
      { month: '2026-01', revenue: 140 },
      { month: '2026-02', revenue: 50 },
    ]);
    expect(engine.value('revenue.total')).toBe(190);
    expect(engine.value('summary.months')).toBe(2);
    // tier folds through: everything downstream of the live feed is live
    expect(engine.scheduler.result('revenue.total')!.tier).toBe('live');
  });

  it('incremental recompute rides cutoff', () => {
    const engine = Engine.fromSources(SOURCES, stdlib);
    engine.run({ 'feeds.orders': { value: orders, tier: 'live' } });
    const more = [...orders, { month: '2026-02', eur: 10 }];
    const pass = engine.update({ 'feeds.orders': { value: more, tier: 'live' } });
    expect(pass.changed).toEqual(expect.arrayContaining(['revenue.by_month', 'revenue.total']));
    expect(engine.value('revenue.total')).toBe(200);
    // summary.months is recomputed but its value (2 distinct months) is unchanged → not "changed"
    expect(pass.changed).not.toContain('summary.months');
  });

  it('runs tests-as-cells and produces the review verdict (metamorphic → validated)', () => {
    const engine = Engine.fromSources(SOURCES, stdlib);
    engine.run({ 'feeds.orders': { value: orders, tier: 'live' } });

    const verdicts = engine.runTests();
    const suite = verdicts.get('revenue.by_month');
    expect(suite).toBeDefined();
    expect(suite!.outcomes.every((o) => o.result.pass)).toBe(true);
    expect(suite!.verdict).toBe('validated');
  });
});
