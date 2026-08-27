// The Caldera LBO case study (docs/case-study/caldera) — the financial-domain
// sibling of the Meridian study. This harness is the *proof* half of the study:
// it loads the document from disk through the real `loadDocument` loader, runs
// it through the real SES-compartment engine (in-process transport, same worker
// body), asserts the port against the Python-generated truth (expected.json —
// an independent implementation of the model), and runs the workbook's own test
// cells through `runTests`, asserting verdicts.
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument } from './loader.ts';
import { memoryReader } from '../app/memoryReader.ts';
import { AsyncEngine } from '../engine/asyncEngine.ts';
import { inMemoryTransport } from '../engine/workerTransport.ts';
import type { ExternalValue } from '../engine/types.ts';
import type { LoadedDocument } from './types.ts';
import { parseTemplate } from '../report/parse/mdx.ts';
import { validateTemplate } from '../report/validate.ts';
import { assembleExternals } from '../app/reportSession.ts';
import { sessionBindings } from '../app/reportSession.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE = join(HERE, '..', '..', 'docs', 'case-study', 'caldera');

async function caseReader(root: string) {
  const files: Record<string, string> = {};
  async function walk(dir: string, prefix = ''): Promise<void> {
    const { readdir } = await import('node:fs/promises');
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(dir, entry.name), rel);
      else files[join(root, rel)] = await readFile(join(dir, entry.name), 'utf8');
    }
  }
  await walk(join(CASE, 'document'));
  return memoryReader(files);
}

async function loadCase(): Promise<{ loaded: LoadedDocument; expected: Record<string, unknown> }> {
  const loaded = await loadDocument(await caseReader('caldera'), 'caldera');
  const expected = JSON.parse(await readFile(join(CASE, 'expected.json'), 'utf8'));
  return { loaded, expected };
}

function externalsFor(loaded: LoadedDocument): Record<string, ExternalValue> {
  const externals: Record<string, ExternalValue> = {};
  for (const fx of loaded.fixtures) {
    externals[`fixtures.${fx.name}`] = { value: fx.frame.rows, tier: 'static' };
  }
  for (const [name, value] of Object.entries(loaded.manifest.params)) {
    externals[`params.${name}`] = { value, tier: 'static' };
  }
  return externals;
}

describe('Caldera LBO case study', () => {
  it('loads the document with no error diagnostics', async () => {
    const { loaded } = await loadCase();
    expect(loaded.worksheets.map((w) => w.name)).toEqual(['model', 'checks']);
    expect(loaded.fixtures.map((f) => f.name).sort()).toEqual([
      'assumptions', 'expected_holdout', 'expected_values', 'historical_segments',
      'ops_plan', 'ops_plan_holdout', 'year_plan',
    ]);
    expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('computes the model against the Python truth', async () => {
    const { loaded, expected } = await loadCase();
    const engine = await AsyncEngine.fromSources(
      Object.fromEntries(loaded.worksheets.map((w) => [w.name, w.source])),
      { transport: inMemoryTransport() },
    );
    const pass = await engine.run(externalsFor(loaded));
    expect([...pass.errors.entries()]).toEqual([]);

    const su = expected.sources_uses as Record<string, number>;
    const exit = expected.exit as Record<string, number>;
    const sched = expected.schedule as Record<string, number>[];
    const ops = expected.operating as Record<string, number>[];

    expect(engine.value('model.ltm_ebitda')).toBeCloseTo(expected.ltm_ebitda as number, 8);

    const suv = engine.value('model.sources_uses') as Record<string, number>;
    expect(suv.entry_ev).toBeCloseTo(su.entry_ev, 6);
    expect(suv.sponsor_equity).toBeCloseTo(su.sponsor_equity, 6);
    expect(suv.uses).toBeCloseTo(su.uses, 6);
    expect(suv.sources - suv.uses).toBeCloseTo(0, 9);

    const opv = engine.value('model.operating') as Record<string, number>[];
    expect(opv.length).toBe(5);
    for (let i = 0; i < 5; i += 1) {
      expect(opv[i].revenue).toBeCloseTo(ops[i].revenue, 6);
      expect(opv[i].ebitda).toBeCloseTo(ops[i].ebitda, 6);
      expect(opv[i].delta_nwc).toBeCloseTo(ops[i].delta_nwc, 6);
    }

    const schedv = engine.value('model.debt_schedule') as Record<string, number>[];
    for (let i = 0; i < 5; i += 1) {
      expect(schedv[i].tlb_end).toBeCloseTo(sched[i].tlb_end, 6);
      expect(schedv[i].mezz_end).toBeCloseTo(sched[i].mezz_end, 6);
      expect(schedv[i].cash_end).toBeCloseTo(sched[i].cash_end, 6);
      expect(schedv[i].leverage).toBeCloseTo(sched[i].leverage, 9);
      expect(schedv[i].coverage).toBeCloseTo(sched[i].coverage, 9);
    }

    const retv = engine.value('model.returns') as Record<string, number>;
    expect(retv.exit_equity).toBeCloseTo(exit.exit_equity, 6);
    expect(retv.irr).toBeCloseTo(exit.irr, 10);
    expect(retv.moic).toBeCloseTo(exit.moic, 9);

    const avg = engine.value('model.returns_avg') as Record<string, number>;
    expect(avg.irr).toBeCloseTo((expected.exit_avg as Record<string, number>).irr, 10);

    expect(engine.value('model.breakeven_exit_multiple')).toBeCloseTo(
      expected.breakeven_exit_multiple as number, 8,
    );

    const grid = engine.value('model.sensitivity') as Record<string, number>[];
    const truth = expected.sensitivity_grid as Record<string, number>[];
    expect(grid.length).toBe(25);
    for (let i = 0; i < 25; i += 1) {
      expect(grid[i].irr).toBeCloseTo(truth[i].irr, 10);
      expect(grid[i].sponsor_equity).toBeCloseTo(truth[i].sponsor_equity, 6);
    }
    // the grid's center must reproduce the interactive base case exactly
    const center = grid.find((r) => r.exit_multiple === 8.0 && r.tlb_turns === 5.0);
    expect(center?.irr).toBe(retv.irr);

    // R3-376 parity: the stdlib irr matches the hand-rolled bisection it replaced,
    // over all 25 grid flows, to 1e-15 (the refactor-safety-net receipt).
    for (const g of truth) {
      const flows = [-g.sponsor_equity, 0, 0, 0, 0, g.exit_equity];
      const npvAt = (r: number): number => flows.reduce((acc, cf, t) => acc + cf / (1 + r) ** t, 0);
      let lo = -0.99;
      let hi = 10;
      for (let i = 0; i < 200; i += 1) {
        const mid = (lo + hi) / 2;
        if (npvAt(mid) > 0) lo = mid;
        else hi = mid;
      }
      const { irr } = await import('../stdlib/financial.ts');
      expect(Math.abs(irr(flows) - (lo + hi) / 2)).toBeLessThanOrEqual(1e-15);
    }
  });

  it('every workbook test cell passes and the key cells are validated, not merely pinned', async () => {
    const { loaded } = await loadCase();
    const engine = await AsyncEngine.fromSources(
      Object.fromEntries(loaded.worksheets.map((w) => [w.name, w.source])),
      { transport: inMemoryTransport() },
    );
    await engine.run(externalsFor(loaded));
    const results = await engine.runTests();

    expect(results.size).toBeGreaterThan(0);
    const failing: string[] = [];
    for (const [subject, r] of results) {
      for (const o of r.outcomes) {
        if (!o.pass) failing.push(`${subject} / ${o.id}: ${o.message}`);
      }
    }
    expect(failing).toEqual([]);

    // R3-373's exit gates, exercised through the real engine: the holdout test
    // substitutes the downside plan fixture and passes against its own oracle…
    const holdout = results.get('model.operating')?.outcomes.find((o) => o.id === 'checks.ops_holdout');
    expect(holdout?.pass).toBe(true);
    // …and an oracle test that used to inline constants now reads its fixture.
    const suOracle = results.get('model.sources_uses')?.outcomes.find((o) => o.id === 'checks.su_vs_oracle');
    expect(suOracle?.pass).toBe(true);

    // the review-surface verdict taxonomy in action: the load-bearing cells
    // carry a metamorphic/property leg, so they read "validated"
    for (const subject of [
      'model.ltm_ebitda', 'model.sources_uses', 'model.sources_uses_row', 'model.operating',
      'model.debt_schedule', 'model.debt_schedule_avg', 'model.returns', 'model.returns_avg',
      'model.sensitivity', 'model.breakeven_exit_multiple',
    ]) {
      expect(results.get(subject)?.verdict, `verdict for ${subject}`).toBe('validated');
    }
  });

  it('the template parses and validates against the component catalog', async () => {
    const { loaded } = await loadCase();
    const template = loaded.templates.find((t) => t.name === 'deal_summary');
    expect(template).toBeDefined();
    const nodes = parseTemplate(template!.source);
    const validation = validateTemplate(nodes);
    expect(validation.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(validation.placeholders).toEqual([]);
  });

  // R3-377: assumptions-as-params. A paramRefs knob shadows its leaf inside the injected
  // fixture value — flipping params.tax_rate 0.25 → 0.30 must reproduce the Python truth
  // for the 30% variant exactly, leave every other fixture untouched, and keep the
  // cells that do not depend on the assumptions fixture at their published values.
  it('a live tax-rate flip (paramRefs) reproduces the Python 30% variant', async () => {
    const { loaded, expected } = await loadCase();
    const engine = await AsyncEngine.fromSources(
      Object.fromEntries(loaded.worksheets.map((w) => [w.name, w.source])),
      { transport: inMemoryTransport() },
    );
    const { externals, paramRefs } = assembleExternals(loaded);
    await engine.run(externals);

    expect(paramRefs.tax_rate).toEqual({ from: 'fixtures.assumptions', path: '0.tax_rate' });
    expect(externals['params.tax_rate']?.value).toBe(0.25);
    const baseIrr = (engine.value('model.returns') as Record<string, number>).irr;
    const baseLtm = engine.value('model.ltm_ebitda');

    // the flip, through the same sessionBindings path the app's params surface uses
    let rerendered = false;
    const bindings = sessionBindings(
      { engine, externals, paramRefs, nodes: [], title: 't', diagnostics: [], sources: {}, loaded, runtimeFeeds: [] },
      () => { rerendered = true; },
    );
    const originalAssumptions = externals['fixtures.assumptions']!.value;
    bindings.setParam('tax_rate', 0.30);
    while (!rerendered) await new Promise((r) => setTimeout(r, 0));

    const variant = expected.tax30_variant as { schedule: Record<string, number>[]; irr: number };
    const sched = engine.value('model.debt_schedule') as Record<string, number>[];
    expect(sched.length).toBe(5);
    for (let i = 0; i < 5; i += 1) {
      expect(sched[i].tlb_end).toBeCloseTo(variant.schedule[i].tlb_end, 6);
      expect(sched[i].cash_end).toBeCloseTo(variant.schedule[i].cash_end, 6);
    }
    const flippedIrr = (engine.value('model.returns') as Record<string, number>).irr;
    expect(flippedIrr).toBeCloseTo(variant.irr, 10);
    expect(flippedIrr).toBeLessThan(baseIrr); // more tax, less sweep, worse returns

    // structural sharing: the fixture value the document shipped is untouched, and the
    // cells that never declared the assumptions fixture are unchanged
    expect((originalAssumptions as Record<string, number>[])[0].tax_rate).toBe(0.25);
    expect((externals['fixtures.assumptions']!.value as Record<string, number>[])[0].tax_rate).toBe(0.30);
    expect(engine.value('model.ltm_ebitda')).toBe(baseLtm);
    expect(externals['params.tax_rate']?.value).toBe(0.30);
  });
});
