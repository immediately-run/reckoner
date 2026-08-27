// Test-input resolution + the two lanes (ARCHITECTURE_PLAN §6, R3-373). A test's declared
// inputs resolve against the same published state a cell's do, then split by local name:
// name-matched entries SUBSTITUTe (the subject formula re-runs over `{ ...live, ...sub }`;
// the holdout shape), name-unmatched entries are AUXILIARY context for `expect`/`relation`
// only (an oracle fixture) and never feed the formula. Authoring errors — an unresolvable
// reference, an absent external, a subject error over the fixture — fail the test with a
// message, never a silent null. The subject's published live value is untouched either way.

import { describe, it, expect } from 'vitest';
import * as stdlib from '../stdlib/index.ts';
import type { Row } from '../stdlib/types.ts';
import type { ExternalValue } from './types.ts';
import { Engine } from './engine.ts';

const liveOrders: Row[] = [
  { month: '2026-01', eur: 100 },
  { month: '2026-02', eur: 50 },
  { month: '2026-01', eur: 40 },
];

const holdoutOrders: Row[] = [
  { month: '2026-01', eur: 30 },
  { month: '2026-02', eur: 10 },
];

const SOURCES: Record<string, string> = {
  revenue: `
    import { cell, testCell, expectEqual } from "@reckoner/stdlib";

    export const by_month = cell({
      doc: "revenue by month for a region",
      inputs: { orders: "feeds.orders", region: "params.region" },
      formula: ({ orders, region }) =>
        orders
          .filter((r) => region === "all" || r.region === region)
          .reduce((a, r) => a + r.eur, 0),
    });

    export const holdout_check = testCell({
      kind: "specification",
      subject: "revenue.by_month",
      inputs: { orders: "fixtures.orders_holdout" },
      expect: ({ result }) => expectEqual(result, 40),
    });

    export const wrong_name = testCell({
      kind: "specification",
      subject: "revenue.by_month",
      inputs: { orderz: "fixtures.orders_holdout" },
      expect: ({ result, inputs }) =>
        result === 190 && inputs.orderz.length === 2
          ? { pass: true, message: "live subject + auxiliary fixture both visible; the unmatched name never fed the formula" }
          : { pass: false, message: "result " + result + ", aux rows " + (inputs.orderz && inputs.orderz.length) },
    });

    export const absent_fixture = testCell({
      kind: "specification",
      subject: "revenue.by_month",
      inputs: { ghost: "fixtures.no_such_fixture" },
      expect: () => ({ pass: true, message: "unreached" }),
    });

    export const unknown_ref = testCell({
      kind: "specification",
      subject: "revenue.by_month",
      inputs: { orders: "ghost_sheet.rows" },
      expect: ({ result }) => expectEqual(result, 40),
    });
  `,
};

function makeEngine(): Engine {
  return Engine.fromSources(SOURCES, stdlib);
}

function externals(): Record<string, ExternalValue> {
  return {
    'feeds.orders': { value: liveOrders, tier: 'live' },
    'params.region': { value: 'all', tier: 'static' },
    'fixtures.orders_holdout': { value: holdoutOrders, tier: 'static' },
  };
}

describe('Engine.runTests — fixture substitution (§6)', () => {
  it('a declaring test runs the subject over its inputs; the live value is untouched', () => {
    const engine = makeEngine();
    engine.run(externals());
    // live: 100 + 50 + 40 = 190; substituted: 30 + 10 = 40 — the expect asserts 40 and passes
    expect(engine.value('revenue.by_month')).toBe(190);

    // outcomes preserve declaration order: holdout_check, wrong_name, unknown_ref
    const outcomes = engine.runTests().get('revenue.by_month')!.outcomes;
    expect(outcomes[0].result.pass).toBe(true);
    expect(engine.value('revenue.by_month')).toBe(190); // the published value never changed
  });

  it('partial substitution keeps the un-substituted inputs live', () => {
    const sources = {
      revenue: `
        import { cell, testCell, expectEqual } from "@reckoner/stdlib";
        export const total = cell({
          doc: "revenue total",
          inputs: { orders: "feeds.orders", tax: "params.tax" },
          formula: ({ orders, tax }) => orders.reduce((a, r) => a + r.eur, 0) * tax,
        });
        export const check = testCell({
          kind: "specification",
          subject: "revenue.total",
          inputs: { orders: "fixtures.orders_holdout" },
          expect: ({ result }) => expectEqual(result, 80), // 40 (fixture) × 2 (live tax)
        });
      `,
    };
    const engine = Engine.fromSources(sources, stdlib);
    engine.run({
      'feeds.orders': { value: liveOrders, tier: 'live' },
      'params.tax': { value: 2, tier: 'static' },
      'fixtures.orders_holdout': { value: holdoutOrders, tier: 'static' },
    });
    const verdicts = engine.runTests();
    const outcome = verdicts.get('revenue.total')!.outcomes[0];
    expect(outcome.result.pass).toBe(true);
  });

  it('a name the subject does not declare is auxiliary: expect sees it, the formula does not', () => {
    const engine = makeEngine();
    engine.run(externals());
    const outcomes = engine.runTests().get('revenue.by_month')!.outcomes;
    const wrong = outcomes.find((o) => o.result.message?.includes('never fed the formula'));
    expect(wrong).toBeDefined();
    expect(wrong!.result.pass).toBe(true); // the live value (190) proves no substitution happened
  });

  it('an absent external fails the test loudly, never a silent null', () => {
    const engine = makeEngine();
    engine.run(externals());
    const outcomes = engine.runTests().get('revenue.by_month')!.outcomes;
    const absent = outcomes.find((o) => o.result.message?.includes('fixtures.no_such_fixture'));
    expect(absent).toBeDefined();
    expect(absent!.result.pass).toBe(false);
    expect(absent!.result.message).toContain('absent external');
  });

  it('an unresolvable test-input reference fails the test with the build-style diagnostic', () => {
    const engine = makeEngine();
    engine.run(externals());
    const outcomes = engine.runTests().get('revenue.by_month')!.outcomes;
    const unknown = outcomes.find((o) => o.result.message?.includes('unknown cell'));
    expect(unknown).toBeDefined();
    expect(unknown!.result.pass).toBe(false);
  });

  it('a subject error over the substituted inputs is a failing test, not a crashed suite', () => {
    const sources = {
      revenue: `
        import { cell, testCell, expectEqual } from "@reckoner/stdlib";
        export const shout = cell({
          doc: "uppercases the input",
          inputs: { name: "params.name" },
          formula: ({ name }) => name.toUpperCase(),
        });
        export const check = testCell({
          kind: "specification",
          subject: "revenue.shout",
          inputs: { name: "fixtures.numeric" },
          expect: ({ result }) => expectEqual(result, "X"),
        });
      `,
    };
    const engine = Engine.fromSources(sources, stdlib);
    engine.run({ 'params.name': { value: 'ada', tier: 'static' }, 'fixtures.numeric': { value: 7, tier: 'static' } });
    const outcome = engine.runTests().get('revenue.shout')!.outcomes[0];
    expect(outcome.result.pass).toBe(false);
    expect(outcome.result.message).toContain('subject errored over substituted inputs');
    // and the whole suite map still settles with a verdict
    expect(engine.runTests().get('revenue.shout')!.verdict).toBe('failing');
  });

  it('a metamorphic relation rides the substituted base (transform of the fixture, not the live feed)', () => {
    const sources = {
      revenue: `
        import { cell, testCell, permutationInvariance } from "@reckoner/stdlib";
        export const total = cell({
          doc: "sum of eur",
          inputs: { orders: "feeds.orders" },
          formula: ({ orders }) => orders.reduce((a, r) => a + r.eur, 0),
        });
        export const permuted = testCell({
          kind: "metamorphic",
          subject: "revenue.total",
          inputs: { orders: "fixtures.orders_holdout" },
          relation: permutationInvariance({ over: "orders" }),
        });
      `,
    };
    const engine = Engine.fromSources(sources, stdlib);
    engine.run({
      'feeds.orders': { value: liveOrders, tier: 'live' },
      'fixtures.orders_holdout': { value: holdoutOrders, tier: 'static' },
    });
    const suite = engine.runTests().get('revenue.total')!;
    expect(suite.outcomes[0].result.pass).toBe(true);
    expect(suite.verdict).toBe('validated');
  });

  it('a test with no declared inputs still asserts over the live subject value', () => {
    const sources = {
      revenue: `
        import { cell, testCell, expectEqual } from "@reckoner/stdlib";
        export const total = cell({
          doc: "sum",
          inputs: { orders: "feeds.orders" },
          formula: ({ orders }) => orders.reduce((a, r) => a + r.eur, 0),
        });
        export const live_check = testCell({
          kind: "characterization",
          subject: "revenue.total",
          expect: ({ result }) => expectEqual(result, 190),
        });
      `,
    };
    const engine = Engine.fromSources(sources, stdlib);
    engine.run({ 'feeds.orders': { value: liveOrders, tier: 'live' } });
    const suite = engine.runTests().get('revenue.total')!;
    expect(suite.outcomes[0].result.pass).toBe(true);
    expect(suite.verdict).toBe('pinned'); // example-based only, per §6
  });
});
