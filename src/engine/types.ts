// Shared types for the recalc scheduler core (ARCHITECTURE_PLAN §4).

import type { Value } from '../stdlib/types.ts';
import type { CellDef, TestCellDef } from '../stdlib/cell.ts';
import type { Tier } from './tier.ts';

export type NodeDef = CellDef | TestCellDef;

/** A workbook: worksheet name → (cell name → registered def). */
export type Workbook = Record<string, Record<string, NodeDef>>;

export interface GraphNode {
  /** `<worksheet>.<cell>`. */
  id: string;
  worksheet: string;
  cell: string;
  kind: 'cell' | 'test';
  def: NodeDef;
  /** Internal dependency node ids (wildcards expanded to their worksheet's cells). */
  deps: string[];
  /** External dependency keys the node reads (`feeds.orders`, `params.region`, …). */
  externals: string[];
  /** Input local-name → how to resolve it, for the scheduler's input assembly. */
  resolvers: InputResolver[];
}

/** How one declared input resolves to a value + tier at recompute time. */
export type InputResolver =
  | { name: string; kind: 'cell'; nodeId: string }
  | { name: string; kind: 'wildcard'; worksheet: string }
  | { name: string; kind: 'external'; key: string };

export interface GraphDiagnostic {
  severity: 'error';
  id: string;
  message: string;
}

export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  /** Cell names per worksheet, for wildcard expansion + resolution. */
  worksheets: Map<string, string[]>;
  /** All external dependency keys the workbook reads. */
  externalInputs: Set<string>;
  diagnostics: GraphDiagnostic[];
}

export interface ExternalValue {
  value: Value;
  tier: Tier;
}

export interface PublishedResult {
  id: string;
  value: Value;
  tier: Tier;
  /** The content key (with the tier, the cutoff identity). */
  key: string;
}

export interface PassResult {
  /** Node ids recomputed this pass (before cutoff pruned their dependents). */
  recomputed: string[];
  /** Node ids whose `(value-key, tier)` actually changed (what propagated). */
  changed: string[];
  results: Map<string, PublishedResult>;
}
