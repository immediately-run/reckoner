// The engine orchestrator (ARCHITECTURE_PLAN §4) — ties the pure spine into one runnable
// pipeline: worksheet sources → SES-confined evaluation → dependency graph → recalc
// scheduler → published results, plus the tests-as-cells run and the review-surface
// verdict. The confined-formula execution is the one effectful step; everything else is the
// pure machinery from ./scheduler, ./graph, ./testrunner and ../stdlib.

import type { Value } from '../stdlib/types.ts';
import type { CellDef, TestCellDef } from '../stdlib/cell.ts';
import type { DependencyGraph, ExternalValue, PassResult, Workbook } from './types.ts';
import { buildGraph } from './graph.ts';
import { Scheduler } from './scheduler.ts';
import { runSuite } from './testrunner.ts';
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
   * Run every test against its subject's settled value, returning the suite result +
   * review-surface verdict per subject cell. Metamorphic invariance relations re-run the
   * subject formula over a transformed input via the injected reevaluate port.
   *
   * (Example-based holdout tests currently assert over the subject's *live* value; running
   * the subject over a test's own fixture inputs — the holdout-substitution semantics — is
   * deferred until the test→subject input mapping is pinned, §6.)
   */
  runTests(): Map<string, SuiteResult> {
    const out = new Map<string, SuiteResult>();
    for (const [subject, tests] of this.testsBySubject) {
      const subjectDef = this.#cellDef.get(subject);
      const suite = runSuite(tests, () => ({
        subject: this.scheduler.result(subject)?.value ?? null,
        inputs: this.scheduler.inputsFor(subject),
        reevaluate: subjectDef === undefined ? undefined : (inputs) => subjectDef.formula(inputs),
      }));
      out.set(subject, suite);
    }
    return out;
  }
}
