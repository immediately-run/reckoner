// The test runner + review-surface verdict (ARCHITECTURE_PLAN §6). Tests-as-cells run on
// the recalc graph like any other cell; this module is the pure logic that turns a
// TestCellDef into a structured pass/fail record and a set of results into the
// **validated / pinned / untested** verdict the review surface renders.
//
// The one effectful thing a metamorphic relation needs — re-evaluating the subject formula
// over a transformed input — is injected as the `reevaluate` port, exactly as the scheduler
// injects its evaluator. So the runner is unit-testable without the SES engine, and the
// same port is the SES eval in production.
//
// Load-bearing verdict rule (§6, review-2): a green suite is NOT a correctness claim.
// "validated" requires a **non-example-based** leg (metamorphic/property) — example-based
// specification/characterization tests are regression evidence, not validation, because an
// inferred formula reproduces its own fitting data by construction. The review surface must
// keep "validated" and "merely pinned" distinct or the testing story is theater.

import type { Value } from '../stdlib/types.ts';
import type { TestCellDef, TestKind } from '../stdlib/cell.ts';
import type { TestResult } from '../stdlib/testing.ts';

export interface TestRunContext {
  /** The subject cell's current value. */
  subject: Value;
  /** The subject's resolved input values (local name → value) — the `expect` context. */
  inputs: Record<string, Value>;
  /**
   * Re-evaluate the subject formula over a modified input set. Required only for
   * invariance relations (permutation/scale) that compare a transformed re-run; a
   * conservation/property relation and an `expect` test never call it.
   */
  reevaluate?: (inputs: Record<string, Value>) => Value;
}

/** Run one test cell against its subject, returning a structured pass/fail record. */
export function runTest(test: TestCellDef, ctx: TestRunContext): TestResult {
  if (test.expect !== undefined) {
    return test.expect({ result: ctx.subject, inputs: ctx.inputs });
  }

  const relation = test.relation;
  if (relation === undefined) {
    return { pass: false, message: 'test cell declares neither expect nor relation.' };
  }

  if (relation.inputToTransform !== undefined && relation.transform !== undefined) {
    if (ctx.reevaluate === undefined) {
      return { pass: false, message: `relation "${relation.type}" needs a reevaluate port.` };
    }
    const name = relation.inputToTransform;
    const transformedInputs = { ...ctx.inputs, [name]: relation.transform(ctx.inputs[name] ?? null) };
    const transformedResult = ctx.reevaluate(transformedInputs);
    return relation.evaluate({ result: ctx.subject, transformedResult, inputs: ctx.inputs });
  }

  return relation.evaluate({ result: ctx.subject, inputs: ctx.inputs });
}

export type CellVerdict = 'untested' | 'pinned' | 'validated' | 'failing';

/** One test's kind + outcome, the input to {@link classifyCell}. */
export interface TestOutcome {
  kind: TestKind;
  pass: boolean;
}

/**
 * The review-surface verdict for a cell from its tests' kinds + outcomes (§6):
 *   - no tests            → `untested`
 *   - any test fails      → `failing`
 *   - a passing metamorphic/property leg → `validated`
 *   - only passing characterization/specification → `pinned` (regression evidence, not validation)
 */
export function classifyCell(outcomes: readonly TestOutcome[]): CellVerdict {
  if (outcomes.length === 0) return 'untested';
  if (outcomes.some((o) => !o.pass)) return 'failing';
  if (outcomes.some((o) => o.kind === 'metamorphic' || o.kind === 'property')) return 'validated';
  return 'pinned';
}

export interface SuiteResult {
  outcomes: { test: TestCellDef; result: TestResult }[];
  verdict: CellVerdict;
}

/**
 * Run every test for one subject and classify the cell. `contextFor` resolves each test's
 * run context (subject value, inputs, reevaluate port).
 */
export function runSuite(
  tests: readonly TestCellDef[],
  contextFor: (test: TestCellDef) => TestRunContext,
): SuiteResult {
  const outcomes = tests.map((test) => ({ test, result: runTest(test, contextFor(test)) }));
  const verdict = classifyCell(outcomes.map((o) => ({ kind: o.test.testKind, pass: o.result.pass })));
  return { outcomes, verdict };
}
