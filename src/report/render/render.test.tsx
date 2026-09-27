import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ReportView from './Renderer.tsx';
import { missing } from './bindings.ts';
import type { Bindings, BoundValue } from './bindings.ts';
import { parseTemplate } from '../parse/mdx.ts';
import type { Row, Value } from '../../stdlib/types.ts';

// A hand-built data port standing in for the engine's tiered results (shell A's verification
// path: unit-render the components against mock Engine values). renderToStaticMarkup runs in
// Node with no DOM — effects (ResizeObserver/matchMedia) don't fire, so charts render their
// wide default. That is exactly the data path we want to assert here.
function ok(value: Value, tier: BoundValue['tier'] = 'static'): BoundValue {
  return { value, tier, status: 'ok' };
}
function bindings(map: Record<string, BoundValue>): Bindings {
  return { resolve: (s) => map[s] ?? missing(s), setParam: () => {} };
}
function render(src: string, map: Record<string, BoundValue>): string {
  return renderToStaticMarkup(createElement(ReportView, { nodes: parseTemplate(src), bindings: bindings(map) }));
}

describe('ReportView', () => {
  it('renders a Kpi value with its resolved binding', () => {
    const html = render('<Kpi source="revenue.total" format="currency" />', { 'revenue.total': ok(1_234_000) });
    expect(html).toContain('rk-kpi-value');
    expect(html).toMatch(/1,234,000|1\.234\.000|1 234 000/);
    expect(html).toContain('data-tier="static"'); // reserved host-badge slot carries the tier
  });

  it('shows a KPI delta from a compare binding', () => {
    const html = render('<Kpi source="a" compare="b" />', { a: ok(110), b: ok(100) });
    expect(html).toContain('rk-kpi-delta');
    expect(html).toContain('data-direction="up"');
  });

  it('degrades a missing binding to a needs-access tile (never a crash)', () => {
    const html = render('<Kpi source="revenue.total" />', {});
    expect(html).toContain('rk-broken');
    expect(html).toContain('Needs data access');
  });

  it('degrades a wrong-shaped binding to a broken tile', () => {
    const html = render('<Kpi source="rows" />', { rows: ok([{ a: 1 }]) });
    expect(html).toContain('rk-broken');
    expect(html).toMatch(/single value/);
  });

  it('renders an unknown component as a placeholder, not an error', () => {
    const html = render('<Timeline source="x.y" />', {});
    expect(html).toContain('rk-placeholder');
    expect(html).toContain('Timeline');
  });

  it('renders a Chart as accessible SVG from row data', () => {
    const rows = [{ month: 'jan', revenue: 10 }, { month: 'feb', revenue: 20 }];
    const html = render('<Chart source="revenue.by_month" kind="line" x="month" y="revenue" />', { 'revenue.by_month': ok(rows) });
    expect(html).toContain('<svg');
    expect(html).toContain('role="img"');
    expect(html).toContain('<path'); // the line series
  });

  it('renders a Table with the declared columns', () => {
    const rows = [{ month: 'jan', revenue: 10 }];
    const html = render('<Table source="t" columns={["month", "revenue"]} />', { t: ok(rows) });
    expect(html).toContain('<table');
    expect(html).toContain('>month<');
    expect(html).toContain('>jan<');
  });

  it('renders a sortable Table header as a real button inside the th (keyboard path, 2.1.1)', () => {
    const rows = [{ month: 'jan', revenue: 10 }];
    const html = render('<Table source="t" columns={["month", "revenue"]} sortable />', { t: ok(rows) });
    // the sort control is a <button type="button"> carrying the visible column label
    expect(html).toMatch(/<th[^>]*><button type="button" class="rk-th-sort">month<\/button>/);
    // unsorted columns carry no aria-sort; it lands on the th (not the button) once sorted
    expect(html).not.toContain('aria-sort');
    // non-sortable tables keep plain th text — no button, no hit-target chrome
    const plain = render('<Table source="t" columns={["month"]} />', { t: ok(rows) });
    expect(plain).not.toContain('rk-th-sort');
  });

  it('renders an inline Value from a params binding', () => {
    const html = render('Region <Value source="params.region" />', { 'params.region': ok('emea') });
    expect(html).toContain('rk-value');
    expect(html).toContain('emea');
  });

  it('faceting draws one small-multiple per partition', () => {
    const rows = [
      { cohort: 'a', month: 'jan', churned: 1 },
      { cohort: 'b', month: 'jan', churned: 2 },
    ];
    const html = render('<Facets source="churn" by="cohort"><Chart kind="bar" x="month" y="churned" /></Facets>', { churn: ok(rows) });
    const facets = html.match(/rk-facet-title/g) ?? [];
    expect(facets).toHaveLength(2);
  });

  it('renders a single-slice pie as a full circle (not a degenerate arc)', () => {
    const rows = [{ seg: 'a', share: 100 }];
    const html = render('<Chart source="mix" kind="pie" value="share" label="seg" />', { mix: ok(rows) });
    expect(html).toContain('<circle'); // a lone 100% slice draws a circle, not an empty arc
  });

  it('renders markdown prose as markup', () => {
    const html = render('# Weekly revenue.\n\nSome **bold** prose.', {});
    expect(html).toContain('<h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders a Callout with its tone and prose children', () => {
    const html = render('<Callout tone="warning">Heads up.</Callout>', {});
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain('Heads up.');
  });
});

describe('the on-pixel inspection affordance (V3)', () => {
  const src = 'Recurring revenue.\n\n<Kpi source="rev.total" format="currency" />\n\n<Callout tone="info">Note.</Callout>';
  const map = { 'rev.total': { value: 5, tier: 'static' as const, status: 'ok' as const } };

  it('with an inspection port, bound elements carry the affordance; unbound ones do not', () => {
    const html = renderToStaticMarkup(
      createElement(ReportView, {
        nodes: parseTemplate(src),
        bindings: bindings(map),
        inspection: { onInspect: () => {}, canInspect: () => true },
      }),
    );
    expect(html).toContain('rk-inspectable');
    expect(html).toContain('data-source="rev.total"');
    expect(html).toContain('aria-label="Inspect rev.total"');
    // exactly one affordance — the Callout (no source) has none
    expect(html.match(/rk-inspect-btn/g)).toHaveLength(1);
  });

  it('the affordance hides for sources the port cannot inspect', () => {
    const html = renderToStaticMarkup(
      createElement(ReportView, {
        nodes: parseTemplate(src),
        bindings: bindings(map),
        inspection: { onInspect: () => {}, canInspect: () => false },
      }),
    );
    expect(html).not.toContain('rk-inspectable');
  });

  it('without a port (plain run mode) nothing renders — no tax on run mode', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { nodes: parseTemplate(src), bindings: bindings(map) }));
    expect(html).not.toContain('rk-inspectable');
    expect(html).not.toContain('rk-inspect-btn');
  });
});

describe('Flow', () => {
  const nodes: Row[] = [
    { id: 'draft', label: 'Drafting', sub: 'agent', x: 0, y: 0, tone: 'agent' },
    { id: 'review', label: 'Review gate', x: 260, y: 0, shape: 'diamond', tone: 'ci' },
    { id: 'merge', label: 'Merge', x: 520, y: 0, shape: 'pill', tone: 'owner' },
  ];
  const edges: Row[] = [
    { from: 'draft', to: 'review', label: 'awaiting review', value: 4, buffer: true, alert: true, tone: 'ci' },
    { from: 'review', to: 'merge', label: 'green', value: '2' },
    { from: 'review', to: 'draft', dashed: true, via: '330,100 70,100' },
  ];
  const tpl = '<Flow nodes="process.n" edges="process.e" title="The roadmap factory" />';

  it('draws nodes, edges with arrowheads, annotations and the buffer triangle', () => {
    const html = render(tpl, { 'process.n': ok(nodes), 'process.e': ok(edges) });
    expect(html).toContain('<svg');
    expect(html).toContain('>Drafting<');
    expect(html).toContain('>Review gate<');
    expect(html).toContain('>agent<'); // sub line
    expect(html).toMatch(/<path class="rk-flow-edge[^"]*"[^>]*marker-end="url\(#rk-flow-arrow-/);
    expect(html).toContain('>awaiting review<');
    expect(html).toContain('>4<');
    expect(html).toContain('rk-flow-buffer');
    expect(html).toContain('rk-flow-alert');
    expect(html.match(/rk-flow-alert/g)).toHaveLength(1);
    expect(html).toContain('rk-flow-dashed');
    expect(html).toContain('aria-label="The roadmap factory: 3 nodes, 3 connections. Drafting → Review gate: awaiting review 4 (alert); Review gate → Merge: green 2."');
  });

  it('a missing binding is a needs-access tile', () => {
    const html = render(tpl, { 'process.n': ok(nodes) });
    expect(html).toContain('Needs data access');
    expect(html).not.toContain('<svg');
  });

  it('an edge to an unknown node id is a broken tile naming the id', () => {
    const html = render(tpl, { 'process.n': ok(nodes), 'process.e': ok([{ from: 'draft', to: 'publish' }]) });
    expect(html).toContain('rk-broken');
    expect(html).toContain('unknown node id &quot;publish&quot;');
    expect(html).not.toContain('<svg');
  });

  it('more than 80 nodes is a broken tile', () => {
    const many = Array.from({ length: 81 }, (_, i) => ({ id: `n${i}`, label: `N${i}`, x: i * 10, y: 0 }));
    const html = render(tpl, { 'process.n': ok(many), 'process.e': ok([]) });
    expect(html).toContain('rk-broken');
    expect(html).toMatch(/80-node cap/);
  });

  it('a non-table binding is a broken tile', () => {
    const html = render(tpl, { 'process.n': ok(3), 'process.e': ok([]) });
    expect(html).toContain('nodes: expected a table of rows');
  });

  it('carries one inspection affordance for the whole diagram (on its nodes binding)', () => {
    const html = renderToStaticMarkup(
      createElement(ReportView, {
        nodes: parseTemplate(tpl),
        bindings: bindings({ 'process.n': ok(nodes), 'process.e': ok(edges) }),
        inspection: { onInspect: () => {}, canInspect: () => true },
      }),
    );
    expect(html.match(/rk-inspect-btn/g)).toHaveLength(1);
    expect(html).toContain('data-source="process.n"');
  });
});

describe('ShowWhen', () => {
  const tpl = '<ShowWhen source="process.flag"><Callout tone="danger">Over bound.</Callout></ShowWhen>';

  it('renders the children when the bound cell is exactly true', () => {
    const html = render(tpl, { 'process.flag': ok(true) });
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain('Over bound.');
    expect(html).not.toContain('rk-broken');
  });

  it('renders nothing when the cell is false — no prose, no broken tile', () => {
    const html = render(tpl, { 'process.flag': ok(false) });
    expect(html).not.toContain('Over bound.');
    expect(html).not.toContain('rk-broken');
  });

  it('a missing binding renders the needs-access tile', () => {
    const html = render(tpl, {});
    expect(html).toContain('rk-broken');
    expect(html).toContain('Needs data access');
    expect(html).not.toContain('Over bound.');
  });

  it('an errored binding renders the broken tile with its message', () => {
    const html = render(tpl, { 'process.flag': { value: null, tier: 'static', status: 'error', message: 'flag threw in the engine' } });
    expect(html).toContain('rk-broken');
    expect(html).toContain('flag threw in the engine');
    expect(html).not.toContain('Over bound.');
  });

  it('refuses truthiness: 1, "true" and a row list each render a broken tile saying true or false', () => {
    for (const v of [1, 'true', [{ a: 1 }]] as Value[]) {
      const html = render(tpl, { 'process.flag': ok(v) });
      expect(html).toContain('rk-broken');
      expect(html).toContain('true or false');
      expect(html).not.toContain('Over bound.');
    }
  });

  it('adds no wrapper element inside a Row — the child is a direct child of the row container', () => {
    const html = render('<Row><ShowWhen source="process.flag"><Callout tone="danger">Over bound.</Callout></ShowWhen></Row>', {
      'process.flag': ok(true),
    });
    expect(html).toMatch(/<div class="rk-row"><div class="rk-callout"/);
  });
});
