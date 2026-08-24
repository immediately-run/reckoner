import { describe, expect, it } from 'vitest';
import { buildReportSession, sessionBindings, xrefDiagnostics } from './reportSession.ts';
import { inMemoryTransport } from '../engine/workerTransport.ts';
import { execSummary, mrrMovements } from '../seed/data.ts';

// End-to-end integration of shell B over the real pipeline: the bundled document loads, the
// SES-confined engine runs the worksheet, and the Bindings adapter resolves cells + params and
// recomputes on a param write. Runs in Node with the real `ses` package (same as the engine
// unit tests).
describe('buildReportSession + sessionBindings', () => {
  it('loads the demo document, runs the engine, and parses the template', async () => {
    const session = await buildReportSession(inMemoryTransport());
    expect(session.title).toBe('Meridian — monthly review');
    expect(session.nodes.length).toBeGreaterThan(0);
    expect(session.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('resolves a cell binding to the engine value + tier', async () => {
    const session = await buildReportSession(inMemoryTransport());
    const bindings = sessionBindings(session, () => {});
    const total = bindings.resolve('review.total');
    expect(total.status).toBe('ok');
    expect(total.tier).toBe('static');
    expect(total.value).toBe(execSummary[execSummary.length - 1].mrr);

    // A percent KPI is a ratio (nrrPct / 100).
    const nrr = bindings.resolve('review.nrr');
    expect(nrr.status).toBe('ok');
    expect(nrr.value).toBeCloseTo((execSummary[execSummary.length - 1].nrrPct as number) / 100, 6);
  });

  it('resolves a param binding and an unknown binding', async () => {
    const session = await buildReportSession(inMemoryTransport());
    const bindings = sessionBindings(session, () => {});
    expect(bindings.resolve('params.span')).toMatchObject({ status: 'ok', value: '12m' });
    expect(bindings.resolve('review.nope').status).toBe('missing');
  });

  it('shapes the growth stack into long rows for the stacked bar', async () => {
    const session = await buildReportSession(inMemoryTransport());
    const bindings = sessionBindings(session, () => {});
    const stack = bindings.resolve('review.growth_stack');
    expect(stack.status).toBe('ok');
    expect(Array.isArray(stack.value)).toBe(true);
    expect((stack.value as unknown[]).length).toBe(mrrMovements.length * 3); // 3 drivers per month
  });

  it('the demo windowed-feed cell resolves and is bound by the template', async () => {
    const session = await buildReportSession(inMemoryTransport());
    const bindings = sessionBindings(session, () => {});
    // No feed is running in this session → the buffer external is absent → the empty slice,
    // resolved by the engine's windowed-input path (never an error).
    const recent = bindings.resolve('review.live_recent_events');
    expect(recent.status).toBe('ok');
    expect(recent.value).toBe(0);
    // and the report binds it (the "events in the trailing window" line).
    expect(
      session.nodes.some(
        (n) =>
          n.type === 'component' &&
          n.name === 'Value' &&
          n.attrs.source?.kind === 'literal' &&
          n.attrs.source.value === 'review.live_recent_events',
      ),
    ).toBe(true);
  });

  it('writing a param recomputes dependent cells (the interaction loop)', async () => {
    const session = await buildReportSession(inMemoryTransport());
    let changes = 0;
    // The worker engine recomputes asynchronously — resolve `onChange` when the pass settles.
    let settled: () => void = () => {};
    const bindings = sessionBindings(session, () => {
      changes++;
      settled();
    });

    const full = bindings.resolve('review.by_month').value as unknown[];
    expect(full.length).toBe(execSummary.length); // span=12m → all months

    const recomputed = new Promise<void>((r) => (settled = r));
    bindings.setParam('span', '6m');
    await recomputed;

    expect(changes).toBe(1);
    expect(bindings.resolve('params.span').value).toBe('6m');
    const windowed = bindings.resolve('review.by_month').value as unknown[];
    expect(windowed.length).toBe(6); // span=6m → last 6 months
  });
});

describe('the demo document under the review surface', () => {
  it('cells() carries docs; tests() carries the demo test cards; runTests() yields honest verdicts', async () => {
    const session = await buildReportSession(inMemoryTransport());
    expect(session.engine.cells().find((c) => c.id === 'review.total')?.doc).toContain('Latest monthly');
    expect(session.engine.tests().map((t) => [t.name, t.kind])).toEqual([
      ['total_check', 'specification'],
      ['nrr_sane', 'property'],
    ]);

    const verdicts = await session.engine.runTests();
    expect(verdicts.get('review.total')?.verdict).toBe('pinned'); // example-based only
    expect(verdicts.get('review.nrr')?.verdict).toBe('validated'); // a property leg
    expect(verdicts.has('review.by_month')).toBe(false); // honestly untested
  });
});

describe('cross-reference validation (worksheet externals vs. what can be supplied)', () => {
  it('the demo document is clean — no error diagnostics, only the frozen-provenance warnings', async () => {
    const session = await buildReportSession(inMemoryTransport());
    expect(session.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    // The demo fixtures cite the "meridian" feed the frozen document doesn't declare —
    // historical provenance, warning-class by design.
    expect(session.diagnostics.some((d) => d.severity === 'warning' && /sourceFeed/.test(d.message))).toBe(true);
  });

  it('a dangling worksheet reference is an error anchored at the declaring worksheet', () => {
    const loaded = {
      root: 'doc',
      manifest: { params: { region: 'all' } },
      worksheets: [{ name: 'revenue', path: 'worksheets/revenue.sheet.js', source: '' }],
      templates: [],
      feeds: [{ name: 'orders', path: 'feeds/orders.feed.json', config: {} }],
      fixtures: [],
      diagnostics: [],
    };
    const nodes = [
      { type: 'component', name: 'Select', attrs: { name: { kind: 'literal', value: 'span' } }, children: [] },
    ] as never;
    const diags = xrefDiagnostics(
      loaded as never,
      [
        { key: 'feeds.orders', site: 'revenue.by_month' }, // declared → silent
        { key: 'feeds.ghost', site: 'revenue.by_month' }, // dangling → error
        { key: 'params.span', site: 'revenue.total' }, // widget param → silent
        { key: 'params.typo', site: 'revenue.total' }, // no default, no widget → warning
      ],
      nodes,
    );
    expect(diags).toHaveLength(2);
    const error = diags.find((d) => d.severity === 'error')!;
    expect(error.message).toContain('feeds.ghost');
    expect(error.file).toBe('worksheets/revenue.sheet.js'); // anchored at the declaring file
    expect(diags.find((d) => d.severity === 'warning')?.message).toContain('typo');
  });
});

describe('the demo document under the value inspector', () => {
  it('cells carry their formula source for read-only display', async () => {
    const session = await buildReportSession(inMemoryTransport());
    const total = session.engine.cells().find((c) => c.id === 'review.total')!;
    expect(total.formulaSource).toContain('rows[rows.length - 1].mrr');
    // the windowed cell (from the windowed-feed PR) describes its window in the resolver,
    // so the inspector can chip it without knowing the input grammar
    const recent = session.engine.cells().find((c) => c.id === 'review.live_recent_events');
    expect(recent?.resolvers.some((r) => r.kind === 'windowed-feed' && r.feed === 'live_regions')).toBe(true);
  });
});
