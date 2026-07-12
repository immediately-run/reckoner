// The worker's formula executor (ARCHITECTURE_PLAN §4). Framework-free so it is driven by an
// in-memory transport in tests and by a real Web Worker in production (src/entry/engine.ts).
// It builds one SES Compartment per worksheet (via `evaluateWorksheet`), keeps the registered
// cell **formulas** here (they are closures — never serializable, never cross the boundary),
// and returns the host a serializable {@link WorkbookDescriptor} to schedule over. `eval` runs
// one cell's formula against host-resolved inputs. Purity makes re-evaluation sound.
//
// Only *cells* enter the value graph here; test cells are validated/executed on a separate
// path (the review surface), not this report-render pipeline.

import * as stdlib from '../../stdlib/index.ts';
import type { Value } from '../../stdlib/types.ts';
import type { CellDef, Formula } from '../../stdlib/cell.ts';
import type { Workbook } from '../types.ts';
import { evaluateWorksheet } from '../compartment.ts';
import { buildGraph } from '../graph.ts';
import { analyze } from '../cycles.ts';
import type { WorkbookDescriptor } from './protocol.ts';

export interface EngineWorker {
  build(sources: Record<string, string>): WorkbookDescriptor;
  /** Run one cell's formula. A formula may be async (§4.1) — the caller awaits the result. */
  eval(id: string, inputs: Record<string, Value>): Value | Promise<Value>;
}

export function createEngineWorker(): EngineWorker {
  const formulas = new Map<string, Formula>();

  return {
    build(sources) {
      formulas.clear();
      const cellWorkbook: Workbook = {};
      for (const [worksheet, source] of Object.entries(sources)) {
        const defs = evaluateWorksheet(source, { ...stdlib });
        const sheet: Record<string, CellDef> = {};
        for (const [name, def] of Object.entries(defs)) {
          if (def.kind === 'cell') {
            sheet[name] = def;
            formulas.set(`${worksheet}.${name}`, def.formula);
          }
        }
        cellWorkbook[worksheet] = sheet;
      }

      const graph = buildGraph(cellWorkbook);
      const { order, cycles } = analyze(graph);
      return {
        cells: [...graph.nodes.values()].map((n) => ({
          id: n.id,
          worksheet: n.worksheet,
          cell: n.cell,
          deps: n.deps,
          externals: n.externals,
          resolvers: n.resolvers,
        })),
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
  };
}
