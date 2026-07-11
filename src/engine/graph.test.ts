import { describe, it, expect } from 'vitest';
import { cell, testCell } from '../stdlib/index.ts';
import { buildGraph, SUBJECT_INPUT } from './graph.ts';
import type { Workbook } from './types.ts';

const noop = () => null;

const workbook: Workbook = {
  revenue: {
    by_month: cell({ doc: 'rev', inputs: { orders: 'feeds.orders', fx: 'static.fx' }, formula: noop }),
    total: cell({ doc: 'total', inputs: { months: 'revenue.by_month' }, formula: noop }),
  },
  metrics: {
    focus: cell({ doc: 'focus', inputs: { which: 'params.metric', candidates: 'revenue.*' }, formula: noop }),
  },
  summary: {
    headline: cell({ doc: 'h', inputs: { t: 'revenue.total', region: 'params.region' }, formula: noop }),
  },
};

describe('buildGraph', () => {
  it('creates a node per cell with internal deps and external inputs', () => {
    const g = buildGraph(workbook);
    expect([...g.nodes.keys()].sort()).toEqual([
      'metrics.focus',
      'revenue.by_month',
      'revenue.total',
      'summary.headline',
    ]);
    expect(g.nodes.get('revenue.by_month')!.externals.sort()).toEqual(['feeds.orders', 'static.fx']);
    expect(g.nodes.get('revenue.by_month')!.deps).toEqual([]);
    expect(g.nodes.get('revenue.total')!.deps).toEqual(['revenue.by_month']);
    expect(g.nodes.get('summary.headline')!.deps).toEqual(['revenue.total']);
    expect(g.externalInputs.has('params.region')).toBe(true);
    expect(g.diagnostics).toEqual([]);
  });

  it('expands a <worksheet>.* wildcard to that worksheet cells (self excluded)', () => {
    const g = buildGraph(workbook);
    // metrics.focus reads revenue.* → depends on both revenue cells
    expect(g.nodes.get('metrics.focus')!.deps.sort()).toEqual(['revenue.by_month', 'revenue.total']);
  });

  it('flags a dangling cell reference', () => {
    const g = buildGraph({
      w: { a: cell({ doc: 'a', inputs: { x: 'w.ghost' }, formula: noop }) },
    });
    expect(g.diagnostics.some((d) => /unknown cell "w.ghost"/.test(d.message))).toBe(true);
  });

  it('flags a wildcard to an unknown worksheet', () => {
    const g = buildGraph({
      w: { a: cell({ doc: 'a', inputs: { c: 'ghost.*' }, formula: noop }) },
    });
    expect(g.diagnostics.some((d) => /unknown worksheet "ghost"/.test(d.message))).toBe(true);
  });

  it('rejects a worksheet named a reserved namespace (enumerability, C-4)', () => {
    const g = buildGraph({ params: { x: cell({ doc: 'x', formula: noop }) } });
    expect(g.diagnostics.some((d) => /reserved namespace/.test(d.message))).toBe(true);
  });

  it('a test node depends on its subject and receives it under $subject', () => {
    const g = buildGraph({
      revenue: {
        by_month: cell({ doc: 'rev', inputs: { orders: 'feeds.orders' }, formula: noop }),
      },
      revenue_tests: {
        check: testCell({
          kind: 'metamorphic',
          subject: 'revenue.by_month',
          inputs: { orders: 'fixtures.orders' },
          expect: () => ({ pass: true, message: 'ok' }),
        }),
      },
    });
    const t = g.nodes.get('revenue_tests.check')!;
    expect(t.kind).toBe('test');
    expect(t.deps).toContain('revenue.by_month');
    expect(t.resolvers.some((r) => r.name === SUBJECT_INPUT)).toBe(true);
    expect(t.externals).toContain('fixtures.orders');
  });
});
