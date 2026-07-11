// The recalc scheduler core (ARCHITECTURE_PLAN §4.2) — the pure decision layer of the
// formula engine: dependency-graph construction with static wildcard expansion, SCC cycle
// detection, the trust-tier lattice + fold, `(value-key, tier)` early cutoff, and
// demand-driven incremental recompute. The SES compartment, worker, async supersession,
// common-epoch barrier, and watchdog circuit breaker are the effectful engine shell that
// drives this core (deferred; see scheduler.ts).

export { buildGraph, SUBJECT_INPUT } from './graph.ts';
export { analyze, hasCycle } from './cycles.ts';
export type { GraphAnalysis } from './cycles.ts';
export { Scheduler, CycleError } from './scheduler.ts';
export type { Evaluator } from './scheduler.ts';
export { meetTier, meetTiers, compareTier, isAutonomousMonotone } from './tier.ts';
export type { Tier } from './tier.ts';
export { contentKey } from './hash.ts';
export type {
  DependencyGraph,
  ExternalValue,
  GraphDiagnostic,
  GraphNode,
  InputResolver,
  NodeDef,
  PassResult,
  PublishedResult,
  Workbook,
} from './types.ts';
