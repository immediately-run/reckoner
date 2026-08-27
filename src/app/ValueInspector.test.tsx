// The value inspector (review surface slice 2). Pure props → static render: name, doc,
// value + tier (plain data — the tier badge is host chrome, review-1 H2), read-only formula
// source, navigable input chips (the V3 hop-by-hop walk), and the coverage state.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ValueInspector from './ValueInspector.tsx';
import type { CellDescriptor, SubjectResult, TestDescriptor } from '../engine/worker/protocol.ts';
import type { InputResolver } from '../engine/types.ts';

const resolvers: InputResolver[] = [
  { name: 'rows', kind: 'external', key: 'feeds.orders' },
  { name: 'raw', kind: 'cell', nodeId: 'revenue.raw' },
  { name: 'tail', kind: 'windowed-feed', feed: 'orders', window: '1h', by: 'ts' },
  { name: 'all', kind: 'wildcard', worksheet: 'revenue' },
];

const cell: CellDescriptor = {
  id: 'revenue.total',
  worksheet: 'revenue',
  cell: 'total',
  doc: 'total revenue, EUR-normalized',
  formulaSource: '({ rows, raw }) => rows.reduce((a, r) => a + r.eur, 0) + raw',
  deps: ['revenue.raw'],
  externals: ['feeds.orders'],
  resolvers,
};

const tests: TestDescriptor[] = [
  { id: 'revenue.total_check', worksheet: 'revenue', name: 'total_check', kind: 'specification', subject: 'revenue.total', inputs: {} },
];

const outcome: SubjectResult = {
  subject: 'revenue.total',
  verdict: 'pinned',
  outcomes: [{ id: 'revenue.total_check', kind: 'specification', pass: true, message: '' }],
};

function render(over: Partial<Parameters<typeof ValueInspector>[0]> = {}): string {
  const props = {
    cell,
    cells: [cell, ...extraCells],
    tests,
    outcome,
    result: { id: 'revenue.total', value: 48_120, tier: 'live' as const, key: 'k' },
    onNavigate: () => {},
    onClose: () => {},
    ...over,
  };
  return renderToStaticMarkup(createElement(ValueInspector, props));
}

/** Upstream cells the precedent neighborhood can walk into. */
const extraCells = [
  {
    id: 'revenue.raw',
    worksheet: 'revenue',
    cell: 'raw',
    doc: 'raw rows',
    formulaSource: '({ rows }) => rows',
    deps: [],
    externals: ['feeds.orders'],
    resolvers: [{ name: 'rows', kind: 'external', key: 'feeds.orders' }] as never,
  },
  {
    id: 'revenue.base',
    worksheet: 'revenue',
    cell: 'base',
    doc: 'base',
    formulaSource: '({ r }) => r.length',
    deps: ['revenue.raw'],
    externals: [],
    resolvers: [{ name: 'r', kind: 'cell', nodeId: 'revenue.raw' }] as never,
  },
];

describe('ValueInspector', () => {
  const html = render();

  it('renders the binding name, doc, value, tier (as data — never a badge), and verdict', () => {
    expect(html).toContain('revenue.total');
    expect(html).toContain('total revenue, EUR-normalized');
    expect(html).toContain('48120');
    expect(html).toContain('tier live');
    expect(html).toContain('rk-verdict--pinned');
    // the tier badge is host-drawn chrome; the app never renders one (review-1 H2)
    expect(html).not.toMatch(/badge/i);
  });

  it('renders the formula source read-only', () => {
    expect(html).toContain('rows.reduce((a, r) =&gt; a + r.eur, 0)');
    expect(html).toContain('<pre');
  });

  it('declared inputs render as chips — cell refs navigable, externals and windows inert', () => {
    expect(html).toContain('rows ← feeds.orders');
    expect(html).toContain('raw ← revenue.raw');
    expect(html).toContain('tail ← feed orders · 1h');
    expect(html).toContain('all ← revenue.*');
    // the cell-ref chip is the only navigable one
    const chips = html.match(/rk-chip[^"]*/g) ?? [];
    expect(chips.filter((c) => c.includes('rk-chip--nav'))).toHaveLength(1);
  });

  it('this cell’s tests render with kind and outcome', () => {
    expect(html).toContain('>specification<');
    expect(html).toContain('total_check');
    expect(html).toContain('>pass<');
  });

  it('an absent outcome renders untested; a failing test shows its message', () => {
    const untested = render({ outcome: undefined });
    expect(untested).toContain('rk-verdict--untested');

    const failing = render({
      outcome: {
        subject: 'revenue.total',
        verdict: 'failing',
        outcomes: [{ id: 'revenue.total_check', kind: 'specification', pass: false, message: 'expected 30, got 29' }],
      },
    });
    expect(failing).toContain('rk-verdict--failing');
    expect(failing).toContain('expected 30, got 29');
  });
});

describe('ValueInspector — the precedent neighborhood (UX-4)', () => {
  it('renders the whole subgraph beneath the cell inputs, nested', () => {
    const html = render();
    // total → raw → feeds.orders: the two-level walk is visible at once
    expect(html).toContain('rk-prec');
    expect(html).toContain('raw:');
    expect(html).toContain('revenue.raw');
    expect(html).toContain('feeds.orders');
    // the meta line states the shape
    expect(html).toMatch(/nodes · depth 1/);
  });

  it('a cell with only external inputs shows no neighborhood (nothing to walk)', () => {
    const onlyExternal = {
      ...cell,
      resolvers: [{ name: 'rows', kind: 'external', key: 'feeds.orders' }] as never,
    };
    const html = render({ cell: onlyExternal });
    expect(html).not.toContain('rk-prec');
  });
});
