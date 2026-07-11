// Metamorphic + property relations (ARCHITECTURE_PLAN §3.2 testing family; §6). These
// are the *load-bearing*, oracle-free correctness signal (review-2): they need no hidden
// data and are what an agent can state well. `conservation`, `permutationInvariance`,
// `scaleInvariance`, and `property` are named stdlib citizens so a test cell can carry
// one as its `relation`.
//
// A relation is a **pure descriptor plus its owned pure logic**: the input transform (for
// invariance relations) and the evaluation of the metamorphic property. The one thing a
// relation does *not* do is re-evaluate the subject formula — that orchestration belongs
// to the M2 test runner, which reads `inputToTransform`, applies `transform` to that
// input, re-runs the subject to obtain `transformedResult`, and calls `evaluate`. Keeping
// the relation's halves pure is what makes them unit-testable here, ahead of the engine.

import type { Value, Row } from './types.ts';
import { deepEqual, expectClose } from './testing.ts';
import type { CloseTolerance, TestResult } from './testing.ts';

export interface RelationContext {
  /** Subject output on the declared inputs. */
  result: Value;
  /** Subject output after the runner applied `transform` to `inputToTransform` (invariance relations). */
  transformedResult?: Value;
  /** The declared input values, for relations that reference them. */
  inputs?: Record<string, Value>;
}

export interface Relation {
  type: 'conservation' | 'permutationInvariance' | 'scaleInvariance' | 'property';
  describe: string;
  /** For invariance relations: which declared input the runner transforms before re-running. */
  inputToTransform?: string;
  /** The pure transform applied to that input's value. */
  transform?: (value: Value) => Value;
  /** Pure evaluation of the metamorphic property. */
  evaluate: (ctx: RelationContext) => TestResult;
}

/**
 * Row-reconciliation conservation: for every row of the result, the `components` columns
 * sum to the `equals` column (within `tol`). This is the MRR-waterfall invariant —
 * `start + new + expansion + contraction + churned + reactivation = end` — a true check
 * because the movement columns are computed independently of `end`.
 */
export function conservation(spec: {
  components: string[];
  equals: string;
  tol?: CloseTolerance;
}): Relation {
  const tol = spec.tol ?? { abs: 1e-9 };
  return {
    type: 'conservation',
    describe: `Σ(${spec.components.join(' + ')}) = ${spec.equals}`,
    evaluate: ({ result }) => {
      const rows = asRows(result);
      if (rows === null) return fail('conservation expects the result to be an array of rows');
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        let total = 0;
        for (const c of spec.components) {
          const v = row[c];
          if (typeof v !== 'number') return fail(`row ${i}: component "${c}" is not a number`);
          total += v;
        }
        const check = expectClose(total, row[spec.equals], tol);
        if (!check.pass) return fail(`row ${i}: ${check.message}`);
      }
      return pass(`conserved across ${rows.length} row(s)`);
    },
  };
}

/**
 * Permutation invariance: reordering the rows of the `over` input must not change the
 * result. The runner re-runs the subject with `over` reversed (a permutation) and this
 * relation asserts the two results are deeply equal.
 */
export function permutationInvariance(spec: { over: string }): Relation {
  return {
    type: 'permutationInvariance',
    describe: `result is invariant to the order of "${spec.over}"`,
    inputToTransform: spec.over,
    transform: (value) => (Array.isArray(value) ? value.slice().reverse() : value),
    evaluate: ({ result, transformedResult }) => {
      if (transformedResult === undefined) return needsRerun('permutationInvariance');
      return deepEqual(result, transformedResult)
        ? pass('order does not matter')
        : fail('result changed when the input rows were reordered');
    },
  };
}

/**
 * Scale invariance: scaling every numeric leaf of the `over` input by `by` scales every
 * numeric leaf of the result by `by`, with non-numeric structure unchanged. Use only
 * when the output is genuinely linear in this input.
 */
export function scaleInvariance(spec: { over: string; by: number; tol?: CloseTolerance }): Relation {
  const tol = spec.tol ?? { rel: 1e-9 };
  return {
    type: 'scaleInvariance',
    describe: `result scales by ${spec.by} when "${spec.over}" scales by ${spec.by}`,
    inputToTransform: spec.over,
    transform: (value) => scaleLeaves(value, spec.by),
    evaluate: ({ result, transformedResult }) => {
      if (transformedResult === undefined) return needsRerun('scaleInvariance');
      const problem = compareScaled(result, transformedResult, spec.by, tol);
      return problem === null ? pass(`scales by ${spec.by}`) : fail(problem);
    },
  };
}

/** A caller-stated invariant: `predicate(result, inputs)` holds. The general escape hatch. */
export function property(
  name: string,
  predicate: (result: Value, inputs: Record<string, Value>) => boolean | TestResult,
): Relation {
  return {
    type: 'property',
    describe: name,
    evaluate: ({ result, inputs }) => {
      const outcome = predicate(result, inputs ?? {});
      if (typeof outcome === 'boolean') {
        return outcome ? pass(name) : fail(`property "${name}" does not hold`);
      }
      return outcome;
    },
  };
}

// --- internals -----------------------------------------------------------------

function pass(message: string): TestResult {
  return { pass: true, message };
}

function fail(message: string): TestResult {
  return { pass: false, message };
}

function needsRerun(type: string): TestResult {
  return fail(`${type} requires the runner to supply transformedResult`);
}

function asRows(value: Value): Row[] | null {
  if (!Array.isArray(value)) return null;
  for (const el of value) {
    if (el === null || typeof el !== 'object' || Array.isArray(el)) return null;
  }
  return value as Row[];
}

function scaleLeaves(value: Value, by: number): Value {
  if (typeof value === 'number') return value * by;
  if (Array.isArray(value)) return value.map((v) => scaleLeaves(v, by));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, Value> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scaleLeaves(v, by);
    return out;
  }
  return value;
}

/** Returns null when `scaled` is `by`×`base` at every numeric leaf; otherwise a message. */
function compareScaled(base: Value, scaled: Value, by: number, tol: CloseTolerance): string | null {
  if (typeof base === 'number') {
    if (typeof scaled !== 'number') return 'shape changed under scaling';
    return expectClose(scaled, base * by, tol).pass ? null : `leaf ${base} did not scale to ${base * by}`;
  }
  if (Array.isArray(base)) {
    if (!Array.isArray(scaled) || scaled.length !== base.length) return 'array shape changed under scaling';
    for (let i = 0; i < base.length; i += 1) {
      const p = compareScaled(base[i], scaled[i], by, tol);
      if (p !== null) return p;
    }
    return null;
  }
  if (base !== null && typeof base === 'object') {
    if (scaled === null || typeof scaled !== 'object' || Array.isArray(scaled)) return 'object shape changed under scaling';
    const bk = Object.keys(base);
    const sk = Object.keys(scaled);
    if (bk.length !== sk.length) return 'object keys changed under scaling';
    for (const k of bk) {
      const p = compareScaled(base[k], (scaled as Record<string, Value>)[k], by, tol);
      if (p !== null) return p;
    }
    return null;
  }
  return deepEqual(base, scaled) ? null : 'non-numeric leaf changed under scaling';
}
