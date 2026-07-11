import { describe, it, expect } from 'vitest';
import { validateTemplate } from './validate.ts';
import { component, markdown, inert } from './nodes.ts';
import type { TemplateNode } from './nodes.ts';

// The §3.3.1 example deck.
const meridianDeck: TemplateNode[] = [
  component('Params', {}, [
    component('Select', { name: 'region', options: ['all', 'emea', 'amer', 'apac'], default: 'all' }),
    component('DateRange', { name: 'period', default: 'last-90d' }),
  ]),
  markdown('# Weekly revenue.'),
  component('Value', { source: 'params.region' }),
  component('Kpi', { source: 'revenue.total', compare: 'revenue.total_prev' }),
  component('Chart', { source: 'revenue.by_month', kind: 'line', x: 'month', y: 'revenue' }),
  component('Facets', { source: 'churn.by_cohort', by: 'cohort' }, [
    component('Chart', { kind: 'bar', x: 'month', y: 'churned' }), // source inherited from Facets
  ]),
];

describe('validateTemplate — the valid deck', () => {
  it('has no diagnostics and collects every source binding', () => {
    const v = validateTemplate(meridianDeck);
    expect(v.diagnostics).toEqual([]);
    expect(v.placeholders).toEqual([]);
    expect(v.bindings).toEqual([
      'churn.by_cohort',
      'params.region',
      'revenue.by_month',
      'revenue.total',
      'revenue.total_prev',
    ]);
  });
});

describe('validateTemplate — degradation and diagnostics', () => {
  it('an unknown component becomes a placeholder, not an error, and its subtree is not descended', () => {
    const v = validateTemplate([component('Timeline', { source: 'x.y' }, [component('Kpi', {})])]);
    expect(v.placeholders).toEqual(['Timeline']);
    expect(v.diagnostics).toHaveLength(1);
    expect(v.diagnostics[0].severity).toBe('warning');
    // the inner Kpi's missing source is NOT reported — the whole subtree is a placeholder.
  });

  it('flags a missing required attribute', () => {
    const v = validateTemplate([component('Kpi', {})]);
    expect(v.diagnostics.some((d) => /missing required attribute "source"/.test(d.message))).toBe(true);
  });

  it('flags a bad enum and a bad variant kind', () => {
    expect(validateTemplate([component('Callout', { tone: 'loud' }, [])]).diagnostics.some((d) => /tone/.test(d.message))).toBe(true);
    expect(validateTemplate([component('Chart', { source: 'a.b', kind: 'donut' })]).diagnostics.some((d) => /kind/.test(d.message))).toBe(true);
  });

  it('flags a non-literal (inert) attribute — nothing is evaluated', () => {
    const v = validateTemplate([component('Kpi', { source: inert('fetch("/x")') })]);
    expect(v.diagnostics.some((d) => /not a literal/.test(d.message))).toBe(true);
    expect(v.bindings).toEqual([]); // an inert source is never a binding
  });

  it('rejects a wildcard source binding (bind one cell)', () => {
    const v = validateTemplate([component('Value', { source: 'revenue.*' })]);
    expect(v.diagnostics.some((d) => /wildcard/.test(d.message))).toBe(true);
  });

  it('rejects an invalid binding string', () => {
    const v = validateTemplate([component('Value', { source: '' })]);
    expect(v.diagnostics.some((d) => /binding/.test(d.message))).toBe(true);
  });

  it('warns on an unknown attribute', () => {
    const v = validateTemplate([component('Value', { source: 'a.b', bogus: 1 })]);
    expect(v.diagnostics.some((d) => d.severity === 'warning' && /unknown attribute "bogus"/.test(d.message))).toBe(true);
  });
});

describe('validateTemplate — structural rules', () => {
  it('Params may only contain widgets', () => {
    const v = validateTemplate([component('Params', {}, [component('Kpi', { source: 'a.b' })])]);
    expect(v.diagnostics.some((d) => /only contain input widgets/.test(d.message))).toBe(true);
  });

  it('Facets must wrap exactly one Chart', () => {
    const two = validateTemplate([
      component('Facets', { source: 'a.b', by: 'g' }, [component('Kpi', { source: 'a.b' })]),
    ]);
    expect(two.diagnostics.some((d) => /exactly one <Chart>/.test(d.message))).toBe(true);
  });

  it('ShowAbove/ShowBelow need exactly one threshold', () => {
    expect(validateTemplate([component('ShowAbove', {}, [])]).diagnostics.some((d) => /exactly one threshold/.test(d.message))).toBe(true);
    expect(
      validateTemplate([component('ShowAbove', { width: 640, dpr: 2 }, [])]).diagnostics.some((d) => /exactly one threshold/.test(d.message)),
    ).toBe(true);
    expect(validateTemplate([component('ShowAbove', { width: 640 }, [component('Value', { source: 'a.b' })])]).diagnostics).toEqual([]);
  });

  it('per-kind required fields: a pie needs value + label', () => {
    const v = validateTemplate([component('Chart', { source: 'a.b', kind: 'pie', value: 'amount' })]);
    expect(v.diagnostics.some((d) => /missing required attribute "label"/.test(d.message))).toBe(true);
  });
});
