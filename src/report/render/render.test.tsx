import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ReportView from './Renderer.tsx';
import { missing } from './bindings.ts';
import type { Bindings, BoundValue } from './bindings.ts';
import { parseTemplate } from '../parse/mdx.ts';
import type { Value } from '../../stdlib/types.ts';

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
