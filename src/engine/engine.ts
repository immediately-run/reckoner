// The engine orchestrator (ARCHITECTURE_PLAN §4) — ties the pure spine into one runnable
// pipeline: worksheet sources → SES-confined evaluation → dependency graph → recalc
// scheduler → published results, plus the tests-as-cells run and the review-surface
// verdict. The confined-formula execution is the one effectful step; everything else is the
// pure machinery from ./scheduler, ./graph, ./testrunner and ../stdlib.

import type { Value } from '../stdlib/types.ts';
import type { CellDef, TestCellDef } from '../stdlib/cell.ts';
import type { DependencyGraph, ExternalValue, PassResult, Workbook } from './types.ts';
import { buildGraph } from './graph.ts';
import { resolversFor } from './graph.ts';
import { Scheduler } from './scheduler.ts';
import { runSuite, substituteInputs } from './testrunner.ts';
import type { SuiteResult } from './testrunner.ts';
import { evaluateWorksheet } from './compartment.ts';

export class Engine {
  readonly graph: DependencyGraph;
  readonly scheduler: Scheduler;
  /** Test cells, keyed by the subject cell id they validate. */
  readonly testsBySubject: Map<string, TestCellDef[]>;

  #cellDef = new Map<string, CellDef>();

  constructor(workbook: Workbook) {
    // Cells drive the value graph; tests are run as a pass over the settled results.
    const cellWorkbook: Workbook = {};
    this.testsBySubject = new Map();
    for (const [worksheet, cells] of Object.entries(workbook)) {
      const cellSheet: Record<string, CellDef> = {};
      for (const [name, def] of Object.entries(cells)) {
        if (def.kind === 'cell') {
          cellSheet[name] = def;
          this.#cellDef.set(`${worksheet}.${name}`, def);
        } else {
          const list = this.testsBySubject.get(def.subject) ?? [];
          list.push(def);
          this.testsBySubject.set(def.subject, list);
        }
      }
      cellWorkbook[worksheet] = cellSheet;
    }
    this.graph = buildGraph(cellWorkbook);
    this.scheduler = new Scheduler(this.graph);
  }

  /** Build an engine from worksheet sources, evaluating each inside a SES Compartment. */
  static fromSources(
    sources: Record<string, string>,
    stdlib: Record<string, unknown>,
  ): Engine {
    const workbook: Workbook = {};
    for (const [worksheet, source] of Object.entries(sources)) {
      workbook[worksheet] = evaluateWorksheet(source, stdlib);
    }
    return new Engine(workbook);
  }

  /** Cold recompute of every cell over the given external inputs. */
  run(externals: Record<string, ExternalValue>): PassResult {
    return this.scheduler.initial(externals, (node, inputs) =>
      (node.def as CellDef).formula(inputs),
    );
  }

  /** Incremental recompute after external changes (feed/param), with cutoff. */
  update(externals: Record<string, ExternalValue>): PassResult {
    return this.scheduler.apply(externals, (node, inputs) =>
      (node.def as CellDef).formula(inputs),
    );
  }

  /** The published value for a cell. */
  value(id: string): Value | undefined {
    return this.scheduler.result(id)?.value;
  }

  /**
   * Run every test against its subject, returning the suite result + review-surface verdict
   * per subject cell. A test that declares its own inputs runs under **fixture substitution**
   * (§6): its declared inputs resolve against the same published state a cell's do and
   * substitute, by local name, for the subject's live inputs — the subject formula re-runs
   * over the merged set and `expect`/`relation` assert against that substituted run (the
   * holdout shape: swap the data input for its fixture, keep params/static live). A test
   * with no declared inputs asserts over the subject's live value, as before. Metamorphic
   * invariance relations re-run the subject formula over a transformed input via the
   * injected `reevaluate` port (the transformed re-run rides the same merged base).
   */
  runTests(): Map<string, SuiteResult> {
    const out = new Map<string, SuiteResult>();
    for (const [subject, tests] of this.testsBySubject) {
      const subjectDef = this.#cellDef.get(subject);
      const liveInputs = this.scheduler.inputsFor(subject);
      const suite = runSuite(tests, (test) => {
        const reevaluate =
          subjectDef === undefined
            ? undefined
            : (inputs: Record<string, Value>) => subjectDef.formula(inputs);
        if (subjectDef === undefined || Object.keys(test.inputs).length === 0) {
          return {
            subject: this.scheduler.result(subject)?.value ?? null,
            inputs: liveInputs,
            reevaluate,
          };
        }

        const { resolvers, diagnostics } = resolversFor(test.inputs, this.graph);
        if (diagnostics.length > 0) {
          return { subject: null, inputs: {}, error: diagnostics[0] };
        }
        const declared = this.scheduler.resolve(resolvers).values;
        const sub = substituteInputs(declared, liveInputs);
        if (!sub.ok) return { subject: null, inputs: {}, error: sub.error };
        try {
          return { subject: subjectDef.formula(sub.inputs), inputs: sub.inputs, reevaluate };
        } catch (e) {
          // The subject errored over the substituted inputs — a data-shape mismatch between
          // the fixture and the formula, which is exactly what the test should report.
          return {
            subject: null,
            inputs: sub.inputs,
            error: `subject errored over substituted inputs: ${(e as Error).message}`,
          };
        }
      });
      out.set(subject, suite);
    }
    return out;
  }
}
