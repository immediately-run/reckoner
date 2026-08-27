// Assumptions-as-params (`paramRefs`, R3-377 — gap G9): expose any fixture leaf as a
// live `params.<name>` knob whose default is read from the leaf. A runtime write
// **shadows the leaf inside the injected fixture value** (structural sharing) so
// formulas see one coherent frozen snapshot — never a second ambient channel — and the
// engine is unchanged: the update rides the existing externals path for `fixtures.<x>`,
// so exactly the cells that declared that fixture recompute.
//
// Pure: resolution + validation + the shadow rewrite take plain values and return
// plain values; the app wires them into externals and `engine.update`.

import type { Value } from '../stdlib/types.ts';
import type { DocumentDiagnostic, FixtureFile, LoadedDocument } from './types.ts';
import type { ParamRef } from './types.ts';
import type { Tier } from '../engine/tier.ts';

export interface ResolvedParamRefs {
  /** `params.<name>` default externals, resolved from the referenced leaves. */
  defaults: Record<string, { value: Value; tier: Tier }>;
  /** The knob registry: name → its fixture + path (what a runtime write shadows). */
  refs: Record<string, ParamRef>;
  /** Referential diagnostics — unknown fixture, unresolvable path. Fatal-per-knob, never silent. */
  diagnostics: DocumentDiagnostic[];
}

/**
 * Validate + resolve a manifest's `paramRefs` against the loaded fixtures: each `from`
 * must name a loaded fixture and each `path` must resolve to a leaf inside its value.
 * Broken knobs produce diagnostics naming the key; the rest still resolve.
 */
export function resolveParamRefs(
  paramRefs: Record<string, ParamRef> | undefined,
  fixtures: readonly FixtureFile[],
): ResolvedParamRefs {
  const byName = new Map(fixtures.map((f) => [f.name, f]));
  const defaults: ResolvedParamRefs['defaults'] = {};
  const refs: ResolvedParamRefs['refs'] = {};
  const diagnostics: DocumentDiagnostic[] = [];
  if (paramRefs === undefined) return { defaults, refs, diagnostics };

  for (const [name, ref] of Object.entries(paramRefs)) {
    const fixture = byName.get(ref.from.replace(/^fixtures\./, ''));
    if (fixture === undefined) {
      diagnostics.push({
        severity: 'error',
        file: 'reckoner.json',
        message: `paramRefs.${name}: "${ref.from}" names no loaded fixture.`,
      });
      continue;
    }
    const leaf = getPath(fixture.frame.rows as Value, ref.path);
    if (leaf === undefined) {
      diagnostics.push({
        severity: 'error',
        file: 'reckoner.json',
        message: `paramRefs.${name}: path "${ref.path}" resolves to nothing inside "${ref.from}".`,
      });
      continue;
    }
    defaults[`params.${name}`] = { value: leaf, tier: fixture.frame.tier === 'pulled' ? 'pulled' : 'static' };
    refs[name] = ref;
  }
  return { defaults, refs, diagnostics };
}

/**
 * Apply a runtime param write: returns the externals patch that (a) records
 * `params.<name>` and (b) rewrites the referenced leaf inside the fixture's value —
 * a structurally-shared copy; the original fixture value is untouched (cells that did
 * not declare this fixture never see the write).
 */
export function paramShadow(
  name: string,
  value: Value,
  ref: ParamRef,
  fixtureValue: Value,
): Record<string, { value: Value }> {
  return {
    [`params.${name}`]: { value },
    [ref.from]: { value: setPath(fixtureValue, ref.path, value) },
  };
}

/** Read a dotted path ("0.tax_rate") into a plain value; undefined when it resolves to nothing. */
export function getPath(value: Value, path: string): Value | undefined {
  let cur: Value | undefined = value;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, Value>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** The structurally-shared inverse of {@link getPath}: copy the spine, replace the leaf. */
export function setPath(value: Value, path: string, leaf: Value): Value {
  const segs = path.split('.');
  const walk = (v: Value, i: number): Value => {
    const seg = segs[i];
    if (i === segs.length - 1) {
      if (Array.isArray(v)) {
        const out = v.slice();
        out[Number(seg)] = leaf;
        return out;
      }
      return { ...(v as Record<string, Value>), [seg]: leaf };
    }
    if (Array.isArray(v)) {
      const out = v.slice();
      out[Number(seg)] = walk(v[Number(seg)], i + 1);
      return out;
    }
    const child = (v as Record<string, Value>)[seg];
    return { ...(v as Record<string, Value>), [seg]: walk(child, i + 1) };
  };
  return walk(value, 0);
}

/** Convenience for the app: validation against a loaded document's fixtures. */
export function paramRefDiagnostics(loaded: LoadedDocument): DocumentDiagnostic[] {
  return resolveParamRefs(loaded.manifest.paramRefs, loaded.fixtures).diagnostics;
}
