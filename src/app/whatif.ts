// The shadow-run orchestrator (WHATIF_SHADOW_EVALUATION_SPEC §2) — the effectful half of
// the what-if mechanism, driven by both surfaces (the inspector's what-if panel and the
// workbook panel's scratch pad):
//
//   1. pin a coherent settled baseline from the base engine (§2.1 — never diff against
//      the live engine, which is a moving target under a ticking feed);
//   2. assemble the patched sources (variants spliced, scratch module added) — pure, §3;
//   3. build a SECOND AsyncEngine over the caller's own transport and refuse scratch
//      tests that target durable subjects (G-WIF-6a);
//   4. re-run external cross-reference validation over the shadow build (G-WIF-10 — an
//      engine build does not validate externals, and an absent external resolves to a
//      silent null);
//   5. run over the pinned externals, run the shadow suite, and diff both values (against
//      the pinned pass) and verdicts (against the base surface's suite results).
//
// The shadow engine's results are returned and forgotten — nothing here writes anywhere.

import { AsyncEngine } from '../engine/asyncEngine.ts';
import type { AsyncPass } from '../engine/asyncEngine.ts';
import type { WorkerTransport } from '../engine/workerTransport.ts';
import type { CellDescriptor, SubjectResult, TestDescriptor } from '../engine/worker/protocol.ts';
import {
  SCRATCH_WORKSHEET,
  dependentsClosure,
  diffPasses,
  diffVerdicts,
  patchSources,
} from '../engine/shadow.ts';
import type { PatchError, ShadowPatch, ValueDelta, VerdictFlip } from '../engine/shadow.ts';
import type { DocumentDiagnostic } from '../document/types.ts';
import type { Value } from '../stdlib/types.ts';
import type { ReportSession } from './reportSession.ts';
import { xrefDiagnostics } from './reportSession.ts';

export type ShadowRefusalCode = PatchError['code'] | 'scratch-subject' | 'build-error';

export interface ShadowRefusal {
  code: ShadowRefusalCode;
  message: string;
  cellId?: string;
}

export interface ShadowSuccess {
  ok: true;
  /** The pinned baseline pass the deltas are relative to (§2.1 provenance). */
  baseline: AsyncPass;
  pass: AsyncPass;
  /** The shadow build's cells/tests — includes scratch cells when a scratch module ran. */
  cells: readonly CellDescriptor[];
  tests: readonly TestDescriptor[];
  /** Shadow suite results per subject. */
  verdicts: Map<string, SubjectResult>;
  /** Value deltas over every durable cell, relative to the pinned baseline. */
  deltas: ValueDelta[];
  /** The dependents closure of the varied cells (empty for scratch-only runs). */
  closure: Set<string>;
  /** Suite verdicts that differ from the base surface's results. */
  verdictFlips: VerdictFlip[];
  /** Cross-reference diagnostics for the shadow build (typo'd externals — G-WIF-10). */
  diagnostics: DocumentDiagnostic[];
  /** Shadow value lookup, for card rendering. */
  valueOf: (id: string) => Value | undefined;
  errorOf: (id: string) => string | undefined;
}

export type ShadowOutcome = ShadowSuccess | { ok: false; refusal: ShadowRefusal };

/**
 * Run one shadow evaluation. The caller owns the transport (create once per surface,
 * reuse across runs — each run re-`build`s, which replaces worker state — and `dispose()`
 * on unmount). `baseVerdicts` are the review surface's current suite results, so verdict
 * flips are computed against exactly what the cards show.
 */
export async function runShadow(
  session: ReportSession,
  patch: ShadowPatch,
  transport: WorkerTransport,
  baseVerdicts: ReadonlyMap<string, SubjectResult> | null,
): Promise<ShadowOutcome> {
  const baseCells = session.engine.cells();

  const patched = patchSources(session.sources, baseCells, patch);
  if (!patched.ok) return { ok: false, refusal: patched.error };

  // Pin the baseline BEFORE the shadow build: the pair (pass, externals) is one settled
  // epoch, and both the shadow run and the diff use only this pair — the base session
  // advancing underneath is invisible to the readout (G-WIF-4's ticking-feed case).
  const baseline = await session.engine.settledSnapshot();

  let shadow: AsyncEngine;
  try {
    shadow = await AsyncEngine.fromSources(patched.sources, { transport });
  } catch (e) {
    return { ok: false, refusal: { code: 'build-error', message: (e as Error).message } };
  }

  // G-WIF-6a: scratch tests may not target durable subjects — a failing scratch test
  // merging into a durable subject's suite would be indistinguishable from a real
  // regression. Refused, not relabeled (spec §1.2; embracing this is open question Q5).
  for (const t of shadow.tests()) {
    if (t.worksheet === SCRATCH_WORKSHEET && !t.subject.startsWith(`${SCRATCH_WORKSHEET}.`)) {
      return {
        ok: false,
        refusal: {
          code: 'scratch-subject',
          message: `scratch test "${t.name}" targets durable cell "${t.subject}" — scratch tests may only target scratch cells.`,
        },
      };
    }
  }

  // G-WIF-10: an engine build does not validate external references and an absent
  // external resolves to a silent null — re-run the load-time cross-reference validation
  // over the shadow build, against the same universe the base validation used.
  const diagnostics = xrefDiagnostics(
    session.loaded,
    shadow.externalReferences(),
    session.nodes,
    session.runtimeFeeds,
  );

  const pass = await shadow.run(baseline.externals);
  const verdicts = await shadow.runTests();

  const durableIds = baseCells.map((c) => c.id);
  const deltas = diffPasses(baseline.pass, pass, durableIds);
  const closure = dependentsClosure(baseCells, Object.keys(patch.variants ?? {}));

  return {
    ok: true,
    baseline: baseline.pass,
    pass,
    cells: shadow.cells(),
    tests: shadow.tests(),
    verdicts,
    deltas,
    closure,
    verdictFlips: diffVerdicts(baseVerdicts, verdicts),
    diagnostics,
    valueOf: (id) => pass.results.get(id)?.value,
    errorOf: (id) => pass.errors.get(id),
  };
}
