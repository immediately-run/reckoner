// The host↔worker message protocol (ARCHITECTURE_PLAN §4). The worker is a terminable formula
// executor; the host owns scheduling + epoch/breaker state (§4.1: "memo/epoch state lives
// outside the worker"). So the worker returns a **serializable** workbook descriptor — the
// graph structure the host schedules over, with the (non-cloneable) formula *functions* kept
// inside the worker — and answers per-cell `eval` requests. Every message is structured-clone
// safe: no functions cross the boundary.
//
// `run-tests` (§6, the review surface) follows the same split: test *cells* (whose
// `expect`/`relation` closures live in the worker realm) are executed worker-side over
// host-computed contexts — the subject's settled value + resolved inputs — and only the
// serializable verdict crosses back.

import type { Value } from '../../stdlib/types.ts';
import type { TestKind } from '../../stdlib/cell.ts';
import type { InputSpec } from '../../stdlib/inputs.ts';
import type { CellVerdict } from '../testrunner.ts';
import type { ExportSpan } from '../compartment.ts';
import type { GraphDiagnostic, InputResolver } from '../types.ts';

/** One cell's graph structure, sans its formula (which stays in the worker). */
export interface CellDescriptor {
  id: string;
  worksheet: string;
  cell: string;
  /** The one-line intent from `cell({ doc })` — the workbook panel's card subtitle. */
  doc: string;
  /** The formula's source text (`Function.prototype.toString` at build) — read-only display. */
  formulaSource: string;
  /**
   * The declaration block's location in the RAW worksheet source (R3-427): offsets for
   * the what-if span-splice, 1-based `line` for file:line display and future editor
   * open-at-line. Optional — a descriptor without one falls back to the
   * unique-occurrence splice; plain data, structured-clone-safe.
   */
  span?: ExportSpan;
  deps: string[];
  externals: string[];
  resolvers: InputResolver[];
}

/** One test cell's card data (the closures stay in the worker). */
export interface TestDescriptor {
  /** `<worksheet>.<name>` — the test's own id. */
  id: string;
  worksheet: string;
  name: string;
  kind: TestKind;
  /** The `<worksheet>.<cell>` this test validates. */
  subject: string;
  /** The test declaration's location in the raw worksheet source (R3-427) — the fix-a-test-by-hand anchor. */
  span?: ExportSpan;
  /**
   * The test's declared inputs (normalized InputSpecs — plain data). The host resolves
   * these against published state and sends the values back per-test in
   * {@link SuiteContext.tests}: name-matched entries substitute for the subject's live
   * inputs (the holdout pattern), name-unmatched entries are auxiliary context for
   * `expect`/`relation` (an oracle fixture) and never feed the formula.
   */
  inputs: Record<string, InputSpec>;
}

/** The serializable workbook the host schedules over. */
export interface WorkbookDescriptor {
  cells: CellDescriptor[];
  /** Test cells, for the review surface (executed via `run-tests`, never on the value graph). */
  tests: TestDescriptor[];
  /** `[worksheet, cellIds]` pairs (a Map is cloneable, but arrays keep the wire explicit). */
  worksheets: [string, string[]][];
  externalInputs: string[];
  /** Topological evaluation order (cells only). */
  order: string[];
  /** Dependency cycles, if any — the workbook is unrunnable when non-empty. */
  cycles: string[][];
  diagnostics: GraphDiagnostic[];
}

/** What the host sends per subject: its settled value + resolved inputs. */
export interface SuiteContext {
  subject: string;
  subjectValue: Value;
  inputs: Record<string, Value>;
  /**
   * Per-test declared-input values the host resolved against published state (R3-373).
   * An entry with `error` fails that test's outcome with the message — an unresolvable
   * reference is never a silent `null`.
   */
  tests?: TestInputContext[];
}

/** One test's host-resolved declared inputs, or the error that resolution hit. */
export interface TestInputContext {
  id: string;
  inputs?: Record<string, Value>;
  error?: string;
}

/** One test's outcome, as the review surface renders it. */
export interface TestOutcomeRecord {
  id: string;
  kind: TestKind;
  pass: boolean;
  message: string;
}

/** A subject's suite result: the review-surface verdict + per-test outcomes. */
export interface SubjectResult {
  subject: string;
  verdict: CellVerdict;
  outcomes: TestOutcomeRecord[];
}

// --- host → worker ---------------------------------------------------------------

export type WorkerRequest =
  | { type: 'build'; sources: Record<string, string> }
  | { type: 'eval'; id: string; token: number; inputs: Record<string, Value> }
  | { type: 'run-tests'; token: number; suites: SuiteContext[] };

// --- worker → host ---------------------------------------------------------------

export type WorkerResponse =
  | { type: 'built'; descriptor: WorkbookDescriptor }
  | { type: 'build-error'; message: string }
  | { type: 'result'; token: number; id: string; value: Value }
  | { type: 'eval-error'; token: number; id: string; message: string }
  | { type: 'test-results'; token: number; suites: SubjectResult[] };
