// The shadow-run orchestrator, end to end over the in-process transport
// (WHATIF_SHADOW_EVALUATION_SPEC §2, gates G-WIF-2/3/4/5/6/6a/10): a real document through
// the real loader, a real base engine, and runShadow over it — asserting the counterfactual
// changes, the pinned baseline's immunity to a moving base session, the deep-copied
// externals (the in-process shared-reference hole, WIF-R1), scratch additivity, verdict
// flips, the durable-subject refusal, and the re-run cross-reference validation.
import { describe, expect, it } from 'vitest';
import { loadDocument } from '../document/loader.ts';
import type { DocumentReader } from '../document/types.ts';
import { AsyncEngine } from '../engine/asyncEngine.ts';
import { inMemoryTransport } from '../engine/workerTransport.ts';
import { assembleExternals } from './reportSession.ts';
import type { ReportSession } from './reportSession.ts';
import { memoryReader } from './memoryReader.ts';
import { runShadow } from './whatif.ts';

const MODEL_SHEET = `import { cell } from "@reckoner/stdlib";

export const base_total = cell({
  doc: "sum of fixture rows",
  inputs: { rows: "fixtures.rows" },
  formula: ({ rows }) => rows.reduce((a, r) => a + r.v, 0),
});

export const scaled = cell({
  doc: "total times the factor param",
  inputs: { total: "model.base_total", factor: "params.factor" },
  formula: ({ total, factor }) => total * factor,
});

export const unrelated = cell({
  doc: "independent of everything",
  inputs: {},
  formula: () => 7,
});
`;

const CHECKS_SHEET = `import { testCell, expectEqual } from "@reckoner/stdlib";

export const scaled_matches = testCell({
  kind: "specification",
  subject: "model.scaled",
  expect: ({ result, inputs }) => expectEqual(result, inputs.total * inputs.factor),
});
`;

function docFiles(): Record<string, string> {
  return {
    '/doc/reckoner.json': JSON.stringify({
      format: 1,
      compat: { stdlib: '>=0.1.0', catalog: '>=0.1.0' },
      worksheets: ['model.sheet.js', 'checks.sheet.js'],
      params: { factor: 2 },
      title: 'What-if harness',
    }),
    '/doc/worksheets/model.sheet.js': MODEL_SHEET,
    '/doc/worksheets/checks.sheet.js': CHECKS_SHEET,
    '/doc/fixtures/rows.frame.json': JSON.stringify({
      rows: [{ v: 1 }, { v: 2 }, { v: 3 }],
      tier: 'static',
    }),
  };
}

// The loader's DocumentReader over the flat file map (the loader.test.ts shape).
function reader(files: Record<string, string>): DocumentReader {
  return memoryReader(files);
}

async function makeSession(): Promise<ReportSession> {
  const loaded = await loadDocument(reader(docFiles()), '/doc');
  expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const sources = Object.fromEntries(loaded.worksheets.map((w) => [w.name, w.source]));
  const engine = await AsyncEngine.fromSources(sources, { transport: inMemoryTransport() });
  const { externals, paramRefs } = assembleExternals(loaded);
  await engine.run(externals);
  return {
    engine,
    externals,
    paramRefs,
    nodes: [],
    title: 'What-if harness',
    diagnostics: [],
    sources,
    loaded,
    runtimeFeeds: [],
    authorsNodes: [],
    authorsFromDocument: false,
  };
}

function baseKeys(session: ReportSession): Map<string, string | undefined> {
  return new Map(session.engine.cells().map((c) => [c.id, session.engine.result(c.id)?.key]));
}

describe('runShadow — formula variants (G-WIF-2, G-WIF-4)', () => {
  it('changes the varied cell and its dependents in the shadow while the base stays bit-identical', async () => {
    const session = await makeSession();
    const before = baseKeys(session);

    const out = await runShadow(
      session,
      { variants: { 'model.base_total': '({ rows }) => rows.reduce((a, r) => a + r.v, 0) + 100' } },
      inMemoryTransport(),
      null,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.pass.errors.size).toBe(0);
    expect(out.valueOf('model.base_total')).toBe(106);
    expect(out.valueOf('model.scaled')).toBe(212);
    expect(out.valueOf('model.unrelated')).toBe(7);

    const changed = out.deltas.map((d) => d.id).sort();
    expect(changed).toEqual(['model.base_total', 'model.scaled']);
    // G-WIF-4: every changed cell is inside the dependents closure of the varied cell.
    for (const id of changed) expect(out.closure.has(id)).toBe(true);

    // The base engine's published results are untouched by the shadow run.
    expect(baseKeys(session)).toEqual(before);
  });

  it('deep-copies the baseline externals: a row-mutating variant cannot corrupt the base session (WIF-R1)', async () => {
    const session = await makeSession();

    const out = await runShadow(
      session,
      { variants: { 'model.base_total': '({ rows }) => { rows.push({ v: 1000 }); return rows.length; }' } },
      inMemoryTransport(),
      null,
    );
    expect(out.ok).toBe(true);

    // Force a fresh base pass over the (hopefully unmutated) fixture rows.
    await session.engine.update({ 'params.factor': { value: 3, tier: 'static' } });
    expect(session.engine.value('model.base_total')).toBe(6);
    expect(session.engine.value('model.scaled')).toBe(18);
  });

  it('surfaces a splice refusal as a typed outcome, never a wrong patch', async () => {
    const session = await makeSession();
    const out = await runShadow(
      session,
      { variants: { 'model.nope': '() => 0' } },
      inMemoryTransport(),
      null,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.code).toBe('unknown-cell');
  });

  it('surfaces a variant that no longer parses as a build-error refusal', async () => {
    const session = await makeSession();
    const out = await runShadow(
      session,
      { variants: { 'model.unrelated': '() => {' } },
      inMemoryTransport(),
      null,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.code).toBe('build-error');
  });
});

describe('runShadow — the pinned baseline (G-WIF-3, G-WIF-4 ticking case)', () => {
  it('settledSnapshot waits for an un-awaited update and returns a coherent, copied pair', async () => {
    const session = await makeSession();
    // Fire-and-forget: the snapshot must include this write and the pass it produced.
    void session.engine.update({ 'params.factor': { value: 5, tier: 'static' } });
    const snap = await session.engine.settledSnapshot();
    expect(snap.externals['params.factor'].value).toBe(5);
    expect(snap.pass.results.get('model.scaled')?.value).toBe(30);

    // Feed-buffer keys written straight into the engine appear in the snapshot…
    await session.engine.update({ 'feedBuffers.x': { value: [{ t: 1 }], tier: 'live' } });
    const snap2 = await session.engine.settledSnapshot();
    expect(snap2.externals['feedBuffers.x'].value).toEqual([{ t: 1 }]);
    // …and are copies: mutating the returned value cannot reach the engine.
    (snap2.externals['feedBuffers.x'].value as { t: number }[]).push({ t: 2 });
    const snap3 = await session.engine.settledSnapshot();
    expect(snap3.externals['feedBuffers.x'].value).toEqual([{ t: 1 }]);
  });

  it('a no-variant shadow over a moving base reports zero deltas against its pinned baseline', async () => {
    const session = await makeSession();
    const baseVerdicts = await session.engine.runTests();

    // A base write racing the run: the snapshot settles it into the baseline, so the
    // shadow computes over the same epoch and the diff is empty (no spurious deltas).
    void session.engine.update({ 'params.factor': { value: 9, tier: 'static' } });
    const out = await runShadow(session, {}, inMemoryTransport(), baseVerdicts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.deltas).toEqual([]);
    expect(out.verdictFlips).toEqual([]);
    expect(out.baseline.results.get('model.scaled')?.value).toBe(54);
  });
});

describe('runShadow — scratch (G-WIF-5, G-WIF-6a, G-WIF-10)', () => {
  const SCRATCH = `import { cell, testCell, expectEqual } from "@reckoner/stdlib";

export const probe = cell({
  doc: "ten times the base total",
  inputs: { t: "model.base_total" },
  formula: ({ t }) => t * 10,
});

export const probe_check = testCell({
  kind: "specification",
  subject: "scratch.probe",
  expect: ({ result }) => expectEqual(result, 60),
});
`;

  it('a scratch-only run is additive: durable values and verdicts untouched, scratch cells first-class', async () => {
    const session = await makeSession();
    const baseVerdicts = await session.engine.runTests();
    const before = baseKeys(session);

    const out = await runShadow(session, { scratch: SCRATCH }, inMemoryTransport(), baseVerdicts);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.deltas).toEqual([]);
    expect(baseKeys(session)).toEqual(before);
    expect(out.valueOf('scratch.probe')).toBe(60);
    expect(out.verdicts.get('scratch.probe')?.verdict).not.toBe('untested');
    // The only verdict difference is the scratch subject appearing.
    expect(out.verdictFlips.map((f) => f.subject)).toEqual(['scratch.probe']);
    // Scratch cells render as cards: they are in the shadow's cell list.
    expect(out.cells.some((c) => c.id === 'scratch.probe')).toBe(true);
  });

  it('refuses a scratch test that targets a durable subject (G-WIF-6a)', async () => {
    const session = await makeSession();
    const hostile = `import { cell, testCell, expectEqual } from "@reckoner/stdlib";

export const sneaky = testCell({
  kind: "specification",
  subject: "model.scaled",
  expect: ({ result }) => expectEqual(result, -1),
});
`;
    const out = await runShadow(session, { scratch: hostile }, inMemoryTransport(), null);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.refusal.code).toBe('scratch-subject');
    expect(out.refusal.message).toContain('model.scaled');
  });

  it('re-runs cross-reference validation: a typo’d external is a diagnostic, not a silent null (G-WIF-10)', async () => {
    const session = await makeSession();
    const typo = `import { cell } from "@reckoner/stdlib";

export const oops = cell({
  doc: "reads a fixture that does not exist",
  inputs: { r: "fixtures.rowz" },
  formula: ({ r }) => r,
});
`;
    const out = await runShadow(session, { scratch: typo }, inMemoryTransport(), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.diagnostics.some((d) => d.message.includes('rowz'))).toBe(true);
  });
});

describe('runShadow — verdict flips (G-WIF-6)', () => {
  it('a test-breaking variant flips the subject in the shadow suite; base verdicts untouched', async () => {
    const session = await makeSession();
    const baseVerdicts = await session.engine.runTests();
    const baseScaled = baseVerdicts.get('model.scaled')?.verdict;
    expect(baseScaled).toBeDefined();
    expect(baseScaled).not.toBe('failing');

    const out = await runShadow(
      session,
      { variants: { 'model.scaled': '({ total, factor }) => total * factor + 1' } },
      inMemoryTransport(),
      baseVerdicts,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.verdicts.get('model.scaled')?.verdict).toBe('failing');
    expect(out.verdictFlips).toEqual([{ subject: 'model.scaled', before: baseScaled, after: 'failing' }]);

    // The base suite still reports the original verdict.
    const after = await session.engine.runTests();
    expect(after.get('model.scaled')?.verdict).toBe(baseScaled);
  });
});
