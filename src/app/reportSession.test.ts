import { describe, expect, it } from 'vitest';
import { buildReportSession, sessionBindings } from './reportSession.ts';
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
