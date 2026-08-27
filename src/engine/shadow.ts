// Shadow-evaluation primitives (WHATIF_SHADOW_EVALUATION_SPEC §3–§4) — the pure half of
// the what-if mechanism: splice a formula variant into its worksheet source, assemble the
// patched sources for a shadow build (variants + the scratch module), walk the dependents
// closure, and diff a shadow pass against the pinned baseline pass. All decision logic,
// no engine, no React — unit-tested without a worker.
//
// The splice is deliberately defensive (§3.1): the descriptor's `formulaSource` is verbatim
// file text only because the compartment transform is line-anchored (G-WIF-1a), and even
// then a short formula can occur inside a longer one — zero or multiple occurrences refuse
// with a typed error, never a silent wrong patch. The clean successor (a build-time source
// span on the descriptor) is booked in the spec's decisions section.

import type { Value } from '../stdlib/types.ts';
import type { AsyncPass } from './asyncEngine.ts';
import type { CellDescriptor, SubjectResult } from './worker/protocol.ts';
import type { CellVerdict } from './testrunner.ts';

/** The reserved worksheet name the scratch buffer builds under (§3.2). */
export const SCRATCH_WORKSHEET = 'scratch';

export interface ShadowPatch {
  /** Formula variants keyed by cell id (`worksheet.cell`) — the function text only. */
  variants?: Record<string, string>;
  /** The scratch pad's module source, added as the `scratch` worksheet. */
  scratch?: string;
}

export type PatchErrorCode =
  | 'formula-not-found'
  | 'formula-ambiguous'
  | 'unknown-cell'
  | 'scratch-collision';

export interface PatchError {
  code: PatchErrorCode;
  message: string;
  /** The variant cell the error is about, when there is one. */
  cellId?: string;
}

export type SpliceResult =
  | { ok: true; source: string }
  | { ok: false; code: 'formula-not-found' | 'formula-ambiguous' };

/** Count non-overlapping occurrences of `needle` in `haystack`. */
function occurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + 1);
  }
  return count;
}

/**
 * Replace a cell's formula text with a variant, iff the text occurs exactly once in the
 * worksheet source (G-WIF-1). Ambiguity covers both identical formulas AND a short
 * formula occurring as a substring of a longer one — refused, not guessed.
 */
export function spliceFormula(sheetSource: string, formulaSource: string, variant: string): SpliceResult {
  const n = occurrences(sheetSource, formulaSource);
  if (n === 0) return { ok: false, code: 'formula-not-found' };
  if (n > 1) return { ok: false, code: 'formula-ambiguous' };
  const at = sheetSource.indexOf(formulaSource);
  return {
    ok: true,
    source: sheetSource.slice(0, at) + variant + sheetSource.slice(at + formulaSource.length),
  };
}

export type PatchResult =
  | { ok: true; sources: Record<string, string> }
  | { ok: false; error: PatchError };

/**
 * Assemble the shadow build's sources: each variant spliced into its worksheet, the
 * scratch module (if any) added under the reserved name. Fail-closed: any refusal aborts
 * the whole patch with a typed error the surface can display.
 */
export function patchSources(
  sources: Record<string, string>,
  cells: readonly CellDescriptor[],
  patch: ShadowPatch,
): PatchResult {
  const out: Record<string, string> = { ...sources };

  for (const [cellId, variant] of Object.entries(patch.variants ?? {})) {
    const cell = cells.find((c) => c.id === cellId);
    if (cell === undefined) {
      return { ok: false, error: { code: 'unknown-cell', cellId, message: `unknown cell "${cellId}".` } };
    }
    const sheet = out[cell.worksheet];
    if (sheet === undefined) {
      return { ok: false, error: { code: 'unknown-cell', cellId, message: `no source for worksheet "${cell.worksheet}".` } };
    }
    const spliced = spliceFormula(sheet, cell.formulaSource, variant);
    if (!spliced.ok) {
      const message =
        spliced.code === 'formula-not-found'
          ? `the formula text of "${cellId}" was not found in worksheet "${cell.worksheet}" — cannot splice safely.`
          : `the formula text of "${cellId}" occurs more than once in worksheet "${cell.worksheet}" — cannot splice unambiguously.`;
      return { ok: false, error: { code: spliced.code, cellId, message } };
    }
    out[cell.worksheet] = spliced.source;
  }

  if (patch.scratch !== undefined) {
    if (SCRATCH_WORKSHEET in out) {
      return {
        ok: false,
        error: {
          code: 'scratch-collision',
          message: `this document already declares a worksheet named "${SCRATCH_WORKSHEET}"; the scratch pad is unavailable.`,
        },
      };
    }
    out[SCRATCH_WORKSHEET] = patch.scratch;
  }

  return { ok: true, sources: out };
}

/**
 * The transitive dependents of `roots` (roots included) — a reverse-edge walk over the
 * descriptor `deps`, which already carry wildcard inputs pre-expanded at build time. This
 * bounds which cells a formula variant CAN have changed (§4); variants cannot change
 * declared inputs, so the closure is identical over base and shadow descriptors.
 */
export function dependentsClosure(cells: readonly CellDescriptor[], roots: readonly string[]): Set<string> {
  const dependents = new Map<string, string[]>();
  for (const cell of cells) {
    for (const dep of cell.deps) {
      const list = dependents.get(dep) ?? [];
      list.push(cell.id);
      dependents.set(dep, list);
    }
  }
  const seen = new Set<string>(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const dependent of dependents.get(id) ?? []) {
      if (!seen.has(dependent)) {
        seen.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return seen;
}

export type DeltaKind = 'changed' | 'new-error' | 'error-cleared' | 'error-changed';

export interface ValueDelta {
  id: string;
  kind: DeltaKind;
  /** The pinned baseline value (absent when the cell errored at baseline). */
  before?: Value;
  /** The shadow value (absent when the cell errors in the shadow). */
  after?: Value;
  beforeError?: string;
  afterError?: string;
}

/**
 * Diff a shadow pass against the PINNED baseline pass (§2.1/§4) over the given cell ids:
 * value changes decided by `contentKey` equality (canonical, collision-free), error
 * transitions reported as their own kinds. Cells identical on both sides are omitted.
 */
export function diffPasses(base: AsyncPass, shadow: AsyncPass, ids: Iterable<string>): ValueDelta[] {
  const out: ValueDelta[] = [];
  for (const id of ids) {
    const baseRes = base.results.get(id);
    const baseErr = base.errors.get(id);
    const shadowRes = shadow.results.get(id);
    const shadowErr = shadow.errors.get(id);

    if (baseErr === undefined && shadowErr !== undefined) {
      out.push({ id, kind: 'new-error', before: baseRes?.value, afterError: shadowErr });
    } else if (baseErr !== undefined && shadowErr === undefined) {
      out.push({ id, kind: 'error-cleared', beforeError: baseErr, after: shadowRes?.value });
    } else if (baseErr !== undefined && shadowErr !== undefined) {
      if (baseErr !== shadowErr) out.push({ id, kind: 'error-changed', beforeError: baseErr, afterError: shadowErr });
    } else if (baseRes !== undefined && shadowRes !== undefined && baseRes.key !== shadowRes.key) {
      out.push({ id, kind: 'changed', before: baseRes.value, after: shadowRes.value });
    }
  }
  return out;
}

export interface VerdictFlip {
  subject: string;
  before: CellVerdict;
  after: CellVerdict;
}

/**
 * Subjects whose suite verdict differs between the base run and the shadow run. A subject
 * absent from a map is `untested` (the review surface's own rule), so a scratch test on a
 * scratch subject reads as untested→X on the shadow side only.
 */
export function diffVerdicts(
  base: ReadonlyMap<string, SubjectResult> | null,
  shadow: ReadonlyMap<string, SubjectResult>,
): VerdictFlip[] {
  const out: VerdictFlip[] = [];
  const subjects = new Set<string>([...(base?.keys() ?? []), ...shadow.keys()]);
  for (const subject of subjects) {
    const before: CellVerdict = base?.get(subject)?.verdict ?? 'untested';
    const after: CellVerdict = shadow.get(subject)?.verdict ?? 'untested';
    if (before !== after) out.push({ subject, before, after });
  }
  return out;
}
