// The worker's formula executor (ARCHITECTURE_PLAN §4). Framework-free so it is driven by an
// in-memory transport in tests and by a real Web Worker in production (src/entry/engine.ts).
// It builds one SES Compartment per worksheet (via `evaluateWorksheet`), keeps the registered
// cell **formulas** here (they are closures — never serializable, never cross the boundary),
// and returns the host a serializable {@link WorkbookDescriptor} to schedule over. `eval` runs
// one cell's formula against host-resolved inputs. Purity makes re-evaluation sound.
//
// Only *cells* enter the value graph; test cells are kept here (their `expect`/`relation`
// closures live in this realm) and run via `runSuites` over host-computed contexts — the
// review surface's execution path (§6), never the report-render pipeline.

import * as stdlib from '../../stdlib/index.ts';
import type { Value } from '../../stdlib/types.ts';
import type { CellDef, Formula, TestCellDef } from '../../stdlib/cell.ts';
import type { Workbook } from '../types.ts';
import { evaluateWorksheet } from '../compartment.ts';
import { buildGraph } from '../graph.ts';
import { analyze } from '../cycles.ts';
import { runSuite } from '../testrunner.ts';
import type { SuiteResult } from '../testrunner.ts';
import type {
  SubjectResult,
  SuiteContext,
  WorkbookDescriptor,
} from './protocol.ts';

export interface EngineWorker {
  build(sources: Record<string, string>): WorkbookDescriptor;
  /** Run one cell's formula. A formula may be async (§4.1) — the caller awaits the result. */
  eval(id: string, inputs: Record<string, Value>): Value | Promise<Value>;
  /**
   * Run every test suite over host-computed contexts (the subject's settled value + resolved
   * inputs), returning the serializable verdicts. The `reevaluate` port for metamorphic
   * invariance relations runs the subject formula here — it is a closure that cannot cross.
   */
  runSuites(suites: readonly SuiteContext[]): SubjectResult[];
}

export function createEngineWorker(): EngineWorker {
  const formulas = new Map<string, Formula>();
  // Subject → its tests, each with the export name (the def itself does not carry one back
  // out of the compartment registry).
  const testsBySubject = new Map<string, { id: string; def: TestCellDef }[]>();

  return {
    build(sources) {
      formulas.clear();
      testsBySubject.clear();
      const cellWorkbook: Workbook = {};
      const tests: WorkbookDescriptor['tests'] = [];
      for (const [worksheet, source] of Object.entries(sources)) {
        const defs = evaluateWorksheet(source, { ...stdlib });
        const sheet: Record<string, CellDef> = {};
        for (const [name, def] of Object.entries(defs)) {
          if (def.kind === 'cell') {
            sheet[name] = def;
            formulas.set(`${worksheet}.${name}`, def.formula);
          } else {
            const id = `${worksheet}.${name}`;
            tests.push({ id, worksheet, name, kind: def.testKind, subject: def.subject, inputs: def.inputs });
            const list = testsBySubject.get(def.subject) ?? [];
            list.push({ id, def });
            testsBySubject.set(def.subject, list);
          }
        }
        cellWorkbook[worksheet] = sheet;
      }

      const graph = buildGraph(cellWorkbook);
      const { order, cycles } = analyze(graph);
      return {
        // The workbook passed to buildGraph holds only `cell` defs (tests were diverted
        // above), so every node's def is a CellDef carrying a `doc`.
        cells: [...graph.nodes.values()].map((n) => ({
          id: n.id,
          worksheet: n.worksheet,
          cell: n.cell,
          doc: n.def.kind === 'cell' ? n.def.doc : '',
          // The formula itself stays in the worker; its source text crosses for the value
          // inspector's read-only display. SES preserves function sources across lockdown.
          formulaSource: n.def.kind === 'cell' ? n.def.formula.toString() : '',
          deps: n.deps,
          externals: n.externals,
          resolvers: n.resolvers,
        })),
        tests,
        worksheets: [...graph.worksheets],
        externalInputs: [...graph.externalInputs],
        order,
        cycles,
        diagnostics: graph.diagnostics,
      };
    },

    eval(id, inputs) {
      const formula = formulas.get(id);
      if (formula === undefined) throw new Error(`unknown cell "${id}"`);
      return formula(inputs);
    },

    runSuites(suites) {
      const out: SubjectResult[] = [];
      for (const ctx of suites) {
        const tests = testsBySubject.get(ctx.subject) ?? [];
        let suite: SuiteResult;
        try {
          suite = runSuite(tests.map((t) => t.def), (def) => {
            const formula = formulas.get(ctx.subject);
            const reevaluate =
              formula === undefined
                ? undefined
                : (inputs: Record<string, Value>): Value => formula(inputs);
            const id = tests.find((t) => t.def === def)?.id;
            const entry = id === undefined ? undefined : ctx.tests?.find((t) => t.id === id);
            if (entry !== undefined && entry.error !== undefined) {
              return { subject: ctx.subjectValue, inputs: ctx.inputs, error: entry.error };
            }
            if (entry === undefined || entry.inputs === undefined) {
              // No declared inputs resolved for this test — the live context, as before.
              return { subject: ctx.subjectValue, inputs: ctx.inputs, reevaluate };
            }

            // R3-373: name-matched entries SUBSTITUTe for the subject's live inputs (the
            // subject formula re-runs over the merged set — the holdout pattern);
            // name-unmatched entries are AUXILIARY context for expect/relation only
            // (an oracle fixture) and never feed the formula.
            const substituted: Record<string, Value> = {};
            const auxiliary: Record<string, Value> = {};
            for (const [name, value] of Object.entries(entry.inputs)) {
              if (name in ctx.inputs) substituted[name] = value;
              else auxiliary[name] = value;
            }

            if (Object.keys(substituted).length === 0) {
              return { subject: ctx.subjectValue, inputs: { ...ctx.inputs, ...auxiliary }, reevaluate };
            }
            const merged = { ...ctx.inputs, ...substituted };
            try {
              const subject = formula!(merged);
              return { subject, inputs: { ...merged, ...auxiliary }, reevaluate };
            } catch (e) {
              // The subject errored over the substituted inputs — a data-shape mismatch
              // between the fixture and the formula, which is exactly what the test
              // should report.
              return {
                subject: null,
                inputs: { ...merged, ...auxiliary },
                error: `subject errored over substituted inputs: ${(e as Error).message}`,
              };
            }
          });
        } catch (e) {
          // A test's own machinery threw (not a plain assertion failure) — every outcome
          // records the error; the suite still settles with a verdict.
          suite = {
            outcomes: tests.map((t) => ({ test: t.def, result: { pass: false, message: `suite crashed: ${(e as Error).message}` } })),
            verdict: 'failing',
          };
        }
        out.push({
          subject: ctx.subject,
          verdict: suite.verdict,
          outcomes: suite.outcomes.map((o) => ({
            id: tests.find((t) => t.def === o.test)?.id ?? o.test.subject,
            kind: o.test.testKind,
            pass: o.result.pass,
            message: o.result.message,
          })),
        });
      }
      return out;
    },
  };
}
