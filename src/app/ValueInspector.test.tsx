// @vitest-environment happy-dom
// The value inspector (review surface slice 2). Two halves:
//  · the pre-existing suite — pure props → static render: name, doc, value + tier
//    (plain data — the tier badge is host chrome, review-1 H2), read-only formula
//    source, navigable input chips (the V3 hop-by-hop walk), the coverage state,
//    the precedent neighborhood, the what-if door and the R3-427 anchors;
//  · the edit door (R3-447, DOCUMENT_NAVIGATOR_SPEC §3/§4) — present beside the
//    anchors only where the row’s path passes the gate, absent (never disabled)
//    otherwise, with the RCD §5.1 disclosure — static render covers presence and
//    the no-host-boot property; the DOM half drives the click.
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import ValueInspector from './ValueInspector.tsx';
import type { CellDescriptor, SubjectResult, TestDescriptor } from '../engine/worker/protocol.ts';
import type { InputResolver } from '../engine/types.ts';

// react-dom/client requires the act environment flag to flush effects deterministically.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    verdicts: new Map([[outcome.subject, outcome]]),
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
    const untested = render({ verdicts: new Map() });
    expect(untested).toContain('rk-verdict--untested');

    const failing = render({
      verdicts: new Map([
        [
          'revenue.total',
          {
            subject: 'revenue.total',
            verdict: 'failing',
            outcomes: [{ id: 'revenue.total_check', kind: 'specification', pass: false, message: 'expected 30, got 29' }],
          },
        ],
      ]),
    });
    expect(failing).toContain('rk-verdict--failing');
    expect(failing).toContain('expected 30, got 29');
  });

  it('null results (suites still computing) render the distinct pending chip, never untested', () => {
    const pending = render({ verdicts: null });
    expect(pending).toContain('rk-verdict--pending');
    expect(pending).toContain('>pending<');
    expect(pending).not.toContain('rk-verdict--untested');
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

describe('the what-if door (spec §1.1, amended 2026-08-28)', () => {
  it('renders the formula row affordance when a handler is provided, and none otherwise', () => {
    expect(render({ onWhatIf: () => {} })).toContain('what if →');
    expect(render()).not.toContain('what if →');
  });
});

describe('file:line anchors from spans (R3-427)', () => {
  it('the formula row and test rows name their exact location when spans + paths exist', () => {
    const withSpan = { ...cell, span: { start: 0, end: 10, line: 12 } };
    const testsWithSpan = tests.map((t) => ({ ...t, span: { start: 0, end: 5, line: 31 } }));
    const html = render({
      cell: withSpan,
      tests: testsWithSpan,
      worksheetPaths: { revenue: 'worksheets/revenue.sheet.js' },
    });
    expect(html).toContain('worksheets/revenue.sheet.js:12');
    expect(html).toContain('worksheets/revenue.sheet.js:31');
  });

  it('renders no anchor without spans or paths — never a wrong location', () => {
    expect(render()).not.toContain('.sheet.js:');
    expect(render({ worksheetPaths: { revenue: 'worksheets/revenue.sheet.js' } })).not.toContain('.sheet.js:');
  });
});

describe('the edit door (R3-447, DOCUMENT_NAVIGATOR_SPEC §3/§4)', () => {
  const spanned = { ...cell, span: { start: 0, end: 10, line: 12 } };
  const spannedTests = tests.map((t) => ({ ...t, span: { start: 0, end: 5, line: 31 }, worksheet: 'checks' }));
  const paths = { revenue: 'worksheets/revenue.sheet.js', checks: 'worksheets/checks.sheet.js' };
  const DISCLOSURE = 'Edits save to the mounted content. Proposing a change back to its repository is not wired yet.';

  it('no door at all when the port is not wired (the seed, non-dispatched flow)', () => {
    const html = render({ cell: spanned, tests: spannedTests, worksheetPaths: paths });
    expect(html).toContain('worksheets/revenue.sheet.js:12'); // the anchors are still data
    expect(html).not.toContain('>edit<');
    expect(html).not.toContain(DISCLOSURE);
  });

  it('a row whose own path fails the gate has no door — the clean row keeps its own', () => {
    const html = render({
      cell: spanned,
      tests: spannedTests,
      worksheetPaths: { revenue: 'worksheets/../../evil.sheet.js', checks: 'worksheets/checks.sheet.js' },
      canEditPath: (rel) => rel === 'worksheets/checks.sheet.js',
      onEdit: () => {},
    });
    expect((html.match(/>edit</g) ?? []).length).toBe(1); // only the test row’s door
  });

  it('the door renders beside BOTH anchors with the disclosure at the button', () => {
    const html = render({
      cell: spanned,
      tests: spannedTests,
      worksheetPaths: paths,
      canEditPath: () => true,
      onEdit: () => {},
    });
    expect((html.match(/>edit</g) ?? []).length).toBe(2);
    expect(html).toContain('rk-ins-edit-note'); // the visible disclosure line, not just the tooltip
    expect(html).toContain(DISCLOSURE);
    expect(html).toContain(`title="${DISCLOSURE}"`);
  });

  it('the disclosure note renders when ONLY a test row carries a door (pinned on the note element, not the tooltip string)', () => {
    const html = render({
      cell: spanned,
      tests: spannedTests,
      worksheetPaths: paths,
      canEditPath: (rel) => rel === 'worksheets/checks.sheet.js',
      onEdit: () => {},
    });
    expect((html.match(/>edit</g) ?? []).length).toBe(1);
    // the note ELEMENT is the assertion: the tooltip carries the same string, so a
    // bare toContain(DISCLOSURE) would pass even with the note gated on the formula
    // row's door alone (round 1's bug) — this is the line that fails without anyDoor
    expect(html).toContain('rk-ins-edit-note');
    expect(html).toContain(DISCLOSURE);
  });

  it('a click hands the row’s own document-relative path to the door', () => {
    const onEdit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(
        createElement(ValueInspector, {
          cell: spanned,
          cells: [spanned],
          tests: spannedTests,
          verdicts: new Map([[outcome.subject, outcome]]),
          result: undefined,
          onNavigate: () => {},
          onClose: () => {},
          worksheetPaths: paths,
          canEditPath: () => true,
          onEdit,
        }),
      );
    });
    const buttons = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'edit');
    expect(buttons.length).toBe(2);
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onEdit).toHaveBeenCalledWith('worksheets/revenue.sheet.js');
    expect(onEdit).toHaveBeenCalledWith('worksheets/checks.sheet.js');
    act(() => root.unmount());
  });
});
