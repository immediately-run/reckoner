// G-WIF-9 (WHATIF_SHADOW_EVALUATION_SPEC §8): a shadow run over the REAL Caldera LBO
// case-study document — the splice fidelity, the closure bound, and the pinned diff all
// exercised over a full finance workbook, with unchanged cells asserted against the same
// Python-generated oracle the base case study is proven against. Node harness only: this
// is a machinery gate, not a browser-latency claim (spec §2.3).
import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from '../document/loader.ts';
import type { LoadedDocument } from '../document/types.ts';
import { AsyncEngine } from '../engine/asyncEngine.ts';
import { inMemoryTransport } from '../engine/workerTransport.ts';
import { assembleExternals } from './reportSession.ts';
import type { ReportSession } from './reportSession.ts';
import { memoryReader } from './memoryReader.ts';
import { runShadow } from './whatif.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE = join(HERE, '..', '..', 'docs', 'case-study', 'caldera');

async function caseReader(root: string) {
  const files: Record<string, string> = {};
  async function walk(dir: string, prefix = ''): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(dir, entry.name), rel);
      else files[join(root, rel)] = await readFile(join(dir, entry.name), 'utf8');
    }
  }
  await walk(join(CASE, 'document'));
  return memoryReader(files);
}

async function calderaSession(): Promise<{ session: ReportSession; expected: Record<string, unknown> }> {
  const loaded: LoadedDocument = await loadDocument(await caseReader('caldera'), 'caldera');
  expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const sources = Object.fromEntries(loaded.worksheets.map((w) => [w.name, w.source]));
  const engine = await AsyncEngine.fromSources(sources, { transport: inMemoryTransport() });
  const { externals, paramRefs } = assembleExternals(loaded);
  await engine.run(externals);
  const expected = JSON.parse(await readFile(join(CASE, 'expected.json'), 'utf8')) as Record<string, unknown>;
  return {
    session: {
      engine,
      externals,
      paramRefs,
      nodes: [],
      title: 'Caldera',
      diagnostics: [],
      sources,
      loaded,
      runtimeFeeds: [],
    },
    expected,
  };
}

describe('G-WIF-9 — shadow run over the Caldera LBO document', () => {
  it('varies model.moic in the shadow; everything outside the closure matches the Python oracle', async () => {
    const { session, expected } = await calderaSession();
    const baseVerdicts = await session.engine.runTests();

    const out = await runShadow(
      session,
      { variants: { 'model.moic': '({ r }) => r.moic * 2' } },
      inMemoryTransport(),
      baseVerdicts,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    // The varied cell changed, and every delta is inside its dependents closure.
    const exit = expected.exit as Record<string, number>;
    expect(out.valueOf('model.moic')).toBeCloseTo(exit.moic * 2, 9);
    expect(out.deltas.map((d) => d.id)).toContain('model.moic');
    for (const d of out.deltas) expect(out.closure.has(d.id)).toBe(true);

    // Cells outside the closure are untouched and still equal the independent oracle.
    const retv = out.pass.results.get('model.returns')?.value as Record<string, number>;
    expect(retv.irr).toBeCloseTo(exit.irr, 10);
    expect(out.valueOf('model.sponsor_irr')).toBeCloseTo(exit.irr, 10);
    expect(out.valueOf('model.ltm_ebitda')).toBeCloseTo(expected.ltm_ebitda as number, 8);
    expect(out.valueOf('model.breakeven_exit_multiple')).toBeCloseTo(
      expected.breakeven_exit_multiple as number,
      8,
    );

    // The base session's published state is byte-identical to before the run.
    expect(session.engine.value('model.moic')).toBeCloseTo(exit.moic, 9);

    // The shadow build carries no cross-reference regressions over the real document.
    expect(out.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
