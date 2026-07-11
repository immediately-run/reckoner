// Cell registration constructors (ARCHITECTURE_PLAN §3.1). A worksheet module is
// evaluated inside the engine's SES compartment and registers cells declaratively with
// `cell()` / `testCell()`; the engine extracts the dependency graph from the
// registrations (names + declared inputs only, no values) and publishes it to the
// scheduler. These constructors are pure: they validate and normalize a descriptor, they
// do not evaluate the formula.

import type { Value } from './types.ts';
import type { InputSpec, WindowedFeed } from './inputs.ts';
import { dependencies, normalizeInputs } from './inputs.ts';
import type { Relation } from './relations.ts';
import type { TestResult } from './testing.ts';

export type Formula = (args: Record<string, Value>) => Value;

export interface CellInit {
  /** One-line intent, specific enough that another agent could write tests from it alone. */
  doc: string;
  /** Local name → declared input path. The *only* way the formula sees data. */
  inputs?: Record<string, string | WindowedFeed>;
  formula: Formula;
}

export interface CellDef {
  kind: 'cell';
  doc: string;
  inputs: Record<string, InputSpec>;
  formula: Formula;
  /** Coarse dependency keys, for the scheduler. */
  dependencies: string[];
}

export type TestKind = 'characterization' | 'specification' | 'metamorphic' | 'property';

const TEST_KINDS: ReadonlySet<string> = new Set([
  'characterization',
  'specification',
  'metamorphic',
  'property',
]);

export type ExpectFn = (ctx: { result: Value; inputs: Record<string, Value> }) => TestResult;

export interface TestCellInit {
  /** Mandatory kind label — drives the review surface (§6); the kinds are not interchangeable. */
  kind: TestKind;
  /** The `<worksheet>.<cell>` this test validates. */
  subject: string;
  inputs?: Record<string, string | WindowedFeed>;
  /** An example-based assertion over the subject's result. Provide this or `relation`, not both. */
  expect?: ExpectFn;
  /** A metamorphic/property relation. Provide this or `expect`, not both. */
  relation?: Relation;
}

export interface TestCellDef {
  kind: 'test';
  testKind: TestKind;
  subject: string;
  inputs: Record<string, InputSpec>;
  dependencies: string[];
  expect?: ExpectFn;
  relation?: Relation;
}

/** Register a formula cell. */
export function cell(init: CellInit): CellDef {
  if (typeof init.doc !== 'string' || init.doc.trim().length === 0) {
    throw new Error('cell() requires a non-empty `doc` stating the cell intent.');
  }
  if (typeof init.formula !== 'function') {
    throw new Error(`cell "${init.doc}" requires a formula function.`);
  }
  const rawInputs = init.inputs ?? {};
  return Object.freeze({
    kind: 'cell',
    doc: init.doc,
    inputs: normalizeInputs(rawInputs),
    formula: init.formula,
    dependencies: dependencies(rawInputs),
  });
}

/** Register a test cell. Its value is a structured pass/fail record carrying its `kind`. */
export function testCell(init: TestCellInit): TestCellDef {
  if (!TEST_KINDS.has(init.kind)) {
    throw new Error(`testCell() kind must be one of ${[...TEST_KINDS].join(', ')}; got ${JSON.stringify(init.kind)}.`);
  }
  if (typeof init.subject !== 'string' || init.subject.trim().length === 0) {
    throw new Error('testCell() requires a non-empty `subject` naming the cell under test.');
  }
  const hasExpect = init.expect !== undefined;
  const hasRelation = init.relation !== undefined;
  if (hasExpect === hasRelation) {
    throw new Error(`testCell "${init.subject}" must declare exactly one of expect or relation.`);
  }
  const rawInputs = init.inputs ?? {};
  const deps = dependencies(rawInputs);
  if (!deps.includes(init.subject)) deps.unshift(init.subject);
  return Object.freeze({
    kind: 'test',
    testKind: init.kind,
    subject: init.subject,
    inputs: normalizeInputs(rawInputs),
    dependencies: deps,
    expect: init.expect,
    relation: init.relation,
  });
}
