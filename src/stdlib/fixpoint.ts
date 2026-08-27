// fixpoint (R3-378, gap G1a — the converged-calculation helper). Excel's iterative-calc
// mode makes circular references converge *invisibly* (or silently explode to zero); the
// stdlib's answer is the explicit fixed point: run a pure `step` until the state stops
// moving, and **return the evidence** — `converged`, `iterations`, `value`. Non-convergence
// is the caller's responsibility to surface (or a visible error), never silent: a
// `converged: false` with the last state is a value the review surface can gate on.
//
// Spec-by-example: the Caldera case study's average-balance interest loop (Excel's
// iterative-calc circular reference, expressed as a converged intra-cell fixed point).

import type { Value } from './types.ts';

export interface FixpointOptions {
  /** Absolute tolerance per numeric leaf (default 1e-12). */
  tol?: number;
  /** Step budget; exceeding it returns `converged: false` with the last state. Default 200. */
  maxIterations?: number;
}

export interface FixpointResult {
  /** False when the budget ran out before the state stopped moving — surface it. */
  converged: boolean;
  /** How many times `step` ran. */
  iterations: number;
  /** The final state (the fixed point when `converged`, else the last iterate). */
  value: Value;
}

/**
 * Iterate `step` from `initial` until consecutive states agree at every numeric leaf
 * (within `tol`, structure strictly), or the budget runs out. Pure; a throwing `step`
 * propagates (a visible cell error); `maxIterations < 1` throws (a degenerate budget is
 * an authoring error, not a convergence verdict).
 */
export function fixpoint(
  initial: Value,
  step: (state: Value) => Value,
  opts: FixpointOptions = {},
): FixpointResult {
  const tol = opts.tol ?? 1e-12;
  const maxIterations = opts.maxIterations ?? 200;
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new Error(`fixpoint: maxIterations must be a positive integer (got ${maxIterations}).`);
  }
  let prev = initial;
  let converged = false;
  let iterations = 0;
  for (; iterations < maxIterations; iterations += 1) {
    const next = step(prev);
    if (closeEnough(prev, next, tol)) {
      converged = true;
      return { converged, iterations: iterations + 1, value: next };
    }
    prev = next;
  }
  return { converged, iterations, value: prev };
}

/** Structural closeness: every numeric leaf within `tol` (absolute), non-numeric leaves equal. */
function closeEnough(a: Value, b: Value, tol: number): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    if (typeof a !== 'number' || typeof b !== 'number') return false;
    return Math.abs(a - b) <= tol;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((el, i) => closeEnough(el, b[i], tol));
  }
  if (a !== null && typeof a === 'object') {
    if (b === null || typeof b !== 'object' || Array.isArray(b)) return false;
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => closeEnough((a as Record<string, Value>)[k], (b as Record<string, Value>)[k], tol));
  }
  return a === b;
}
