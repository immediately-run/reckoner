// The author's view (AUTHORS_VIEW_SPEC): the pure wiring — scaffold validity (G-AV-8),
// consumer-template exclusion (G-AV-3/G-AV-4 halves), the allowlisted data summaries
// with credential-stripping (G-AV-9) — and the reflection components static-rendered
// against a hand-built port: chips per computed state + the distinct pending state
// (G-AV-6), unknown-filter broken tiles (G-AV-5), and the no-port author's-view-only
// tile (G-AV-7).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseTemplate } from '../report/parse/mdx.ts';
import { validateTemplate } from '../report/validate.ts';
import { ReportView, missing } from '../report/index.ts';
import type { Bindings, ReflectionPort } from '../report/index.ts';
import type { CellDescriptor, SubjectResult, TestDescriptor } from '../engine/worker/protocol.ts';
import type { LoadedDocument } from '../document/types.ts';
import { AUTHORS_VIEW_SCAFFOLD, consumerTemplate, dataSummaries } from './authorsView.ts';

const bindings: Bindings = { resolve: (source) => missing(source), setParam: () => {} };

function cellDesc(id: string, doc = '', formulaSource = '() => 1'): CellDescriptor {
  const [worksheet, cell] = id.split('.');
  return { id, worksheet, cell, doc, formulaSource, deps: [], externals: [], resolvers: [] };
}

const cells = [cellDesc('model.total', 'the headline number'), cellDesc('checks.guard', '', '() => 2')];
const tests: TestDescriptor[] = [
  { id: 'checks.total_check', worksheet: 'checks', name: 'total_check', kind: 'specification', subject: 'model.total', inputs: {} },
];
const verdicts = new Map<string, SubjectResult>([
  ['model.total', { subject: 'model.total', verdict: 'pinned', outcomes: [{ id: 'checks.total_check', kind: 'specification', pass: true, message: '' }] }],
]);

function port(over: Partial<Omit<ReflectionPort, 'cells' | 'tests'>> = {}): ReflectionPort {
  return {
    cells: () => cells,
    tests: () => tests,
    verdicts,
    fixtures: [{ name: 'rows', rowCount: 3, firstRowColumns: ['month', 'mrr'], declaredTier: 'static', sourceFeed: 'orders' }],
    feeds: [{ name: 'orders', mode: 'poll', hosts: ['https://api.example.com'] }],
    ...over,
  };
}

function render(source: string, reflection?: ReflectionPort): string {
  return renderToStaticMarkup(
    createElement(ReportView, { nodes: parseTemplate(source), bindings, reflection }),
  );
}

describe('the scaffold (G-AV-8)', () => {
  it('parses and validates against the catalog with zero diagnostics', () => {
    const nodes = parseTemplate(AUTHORS_VIEW_SCAFFOLD);
    expect(validateTemplate(nodes).diagnostics).toEqual([]);
    expect(nodes.some((n) => n.type === 'component' && n.name === 'FormulaIndex')).toBe(true);
  });

  it('renders the full default view from a live port (G-AV-1 surface half)', () => {
    const html = render(AUTHORS_VIEW_SCAFFOLD, port());
    expect(html).toContain('Decisions.');
    expect(html).toContain('model.total'.split('.')[1]); // the cell card
    expect(html).toContain('the headline number');
    expect(html).toContain('total_check');
    expect(html).toContain('rows'); // fixture
    expect(html).toContain('api.example.com'); // feed host
  });

  it('a custom view omitting FormulaIndex renders without it — no enforcement (G-AV-2 surface half)', () => {
    const html = render('# Mine.\n\n<SuiteSummary />\n', port());
    expect(html).not.toContain('rk-refl-formula');
    expect(html).toContain('rk-refl-suite');
  });
});

describe('consumer-template selection (G-AV-3/G-AV-4)', () => {
  const t = (name: string) => ({ name });

  it('excludes the author’s view and keeps the weekly guess', () => {
    expect(consumerTemplate([t('authors_view'), t('deal_summary')], 'authors_view')?.name).toBe('deal_summary');
    expect(consumerTemplate([t('authors_view'), t('weekly'), t('other')], 'authors_view')?.name).toBe('weekly');
    expect(consumerTemplate([t('authors_view')], 'authors_view')).toBeUndefined();
  });

  it('honors a manifest-named author’s view', () => {
    expect(consumerTemplate([t('workings'), t('weekly')], 'workings')?.name).toBe('weekly');
  });
});

describe('dataSummaries — the allowlist projection (G-AV-9)', () => {
  it('derives fixture shape and strips feed URLs to scheme+host — a query-string credential never crosses', () => {
    const loaded = {
      fixtures: [
        { name: 'rows', path: 'fixtures/rows.frame.json', frame: { rows: [{ a: 1, b: 2 }, { a: 3 }], provenance: { sourceFeed: 'orders' }, tier: 'static' } },
      ],
      feeds: [
        { name: 'orders', path: 'feeds/orders.feed.json', config: { source: 'https://api.example.com/v1/orders?api_key=SECRET123&window=1h', mode: 'poll', auth: { secretRef: 'prod_orders_key' } } },
        { name: 'raw', path: 'feeds/raw.feed.json', config: { source: 'not a url', mode: 'subscribe' } },
      ],
    } as unknown as LoadedDocument;

    const { fixtures, feeds } = dataSummaries(loaded);
    expect(fixtures).toEqual([
      { name: 'rows', rowCount: 2, firstRowColumns: ['a', 'b'], declaredTier: 'static', sourceFeed: 'orders' },
    ]);
    expect(feeds).toEqual([
      { name: 'orders', mode: 'poll', hosts: ['https://api.example.com'] },
      { name: 'raw', mode: 'subscribe', hosts: ['unparseable source'] },
    ]);
    const flat = JSON.stringify(feeds);
    expect(flat).not.toContain('SECRET123');
    expect(flat).not.toContain('api_key');
    expect(flat).not.toContain('prod_orders_key');
    expect(flat).not.toContain('/v1/orders');
  });
});

describe('reflection components — degradation and chips', () => {
  it('render the author’s-view-only tile without a port (G-AV-7)', () => {
    for (const tag of ['<FormulaIndex />', '<TestIndex />', '<DataInventory />', '<SuiteSummary />']) {
      const html = render(tag);
      expect(html).toContain('available only in the author'); // apostrophe HTML-escapes in static markup
    }
  });

  it('refuse an unknown worksheet filter with a broken tile (G-AV-5)', () => {
    const html = render('<FormulaIndex worksheet="modle" />', port());
    expect(html).toContain('unknown worksheet');
    expect(html).not.toContain('rk-refl-formula');
  });

  it('chips: computed verdicts use the panel classes; a subject without tests is untested (G-AV-6)', () => {
    const html = render('<FormulaIndex />', port());
    expect(html).toContain('rk-verdict--pinned');
    expect(html).toContain('rk-verdict--untested'); // checks.guard has no tests
    expect(html).not.toContain('rk-verdict--pending');
  });

  it('a null-verdicts port renders the pending state, never a verdict, and SuiteSummary says running (G-AV-6)', () => {
    const html = render(AUTHORS_VIEW_SCAFFOLD, port({ verdicts: null }));
    expect(html).toContain('rk-verdict--pending');
    expect(html).not.toContain('rk-verdict--untested');
    expect(html).not.toContain('rk-verdict--pinned');
    expect(html).toContain('Running suites…');
  });

  it('declared tier renders as plain labeled data, not chip chrome (G-AV-9 / §3.2)', () => {
    const html = render('<DataInventory kind="fixtures" />', port());
    expect(html).toContain('declared tier: static');
    expect(html).toContain('captured from feed');
    // The declared tier must not ride the verdict/chip vocabulary.
    expect(html).not.toContain('rk-verdict--');
  });
});
