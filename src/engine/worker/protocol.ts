// The host↔worker message protocol (ARCHITECTURE_PLAN §4). The worker is a terminable formula
// executor; the host owns scheduling + epoch/breaker state (§4.1: "memo/epoch state lives
// outside the worker"). So the worker returns a **serializable** workbook descriptor — the
// graph structure the host schedules over, with the (non-cloneable) formula *functions* kept
// inside the worker — and answers per-cell `eval` requests. Every message is structured-clone
// safe: no functions cross the boundary.

import type { Value } from '../../stdlib/types.ts';
import type { GraphDiagnostic, InputResolver } from '../types.ts';

/** One cell's graph structure, sans its formula (which stays in the worker). */
export interface CellDescriptor {
  id: string;
  worksheet: string;
  cell: string;
  deps: string[];
  externals: string[];
  resolvers: InputResolver[];
}

/** The serializable workbook the host schedules over. */
export interface WorkbookDescriptor {
  cells: CellDescriptor[];
  /** `[worksheet, cellIds]` pairs (a Map is cloneable, but arrays keep the wire explicit). */
  worksheets: [string, string[]][];
  externalInputs: string[];
  /** Topological evaluation order (cells only). */
  order: string[];
  /** Dependency cycles, if any — the workbook is unrunnable when non-empty. */
  cycles: string[][];
  diagnostics: GraphDiagnostic[];
}

// --- host → worker ---------------------------------------------------------------

export type WorkerRequest =
  | { type: 'build'; sources: Record<string, string> }
  | { type: 'eval'; id: string; token: number; inputs: Record<string, Value> };

// --- worker → host ---------------------------------------------------------------

export type WorkerResponse =
  | { type: 'built'; descriptor: WorkbookDescriptor }
  | { type: 'build-error'; message: string }
  | { type: 'result'; token: number; id: string; value: Value }
  | { type: 'eval-error'; token: number; id: string; message: string };
