// The formula engine (ARCHITECTURE_PLAN §4). The pure decision layer — dependency-graph
// construction with static wildcard expansion, SCC cycle detection, the trust-tier lattice +
// fold, `(value-key, tier)` early cutoff, demand-driven incremental recompute — plus the
// worker-backed async shell that drives it: the terminable SES worker (`worker/`,
// `entry/engine.ts`), the host `AsyncEngine` with the watchdog + single-slot supersession, and
// the `CircuitBreaker`. Still deferred (see asyncEngine.ts): the common-epoch barrier for
// glitch-freedom under continuous live feeds.

export { buildGraph, SUBJECT_INPUT } from './graph.ts';
export { analyze, hasCycle } from './cycles.ts';
export type { GraphAnalysis } from './cycles.ts';
export { Scheduler, CycleError } from './scheduler.ts';
export type { Evaluator } from './scheduler.ts';
export { runTest, runSuite, classifyCell } from './testrunner.ts';
export type { CellVerdict, SuiteResult, TestOutcome, TestRunContext } from './testrunner.ts';
export { Engine } from './engine.ts';
export { evaluateWorksheet, evaluateConfined } from './compartment.ts';
export { resolveInputs, shortName } from './resolve.ts';
export type { ResolveState } from './resolve.ts';
export { AsyncEngine, TimeoutError } from './asyncEngine.ts';
export type { AsyncEngineOptions, AsyncPass } from './asyncEngine.ts';
export { CircuitBreaker, DEFAULT_BREAKER } from './circuitBreaker.ts';
export type { BreakerConfig } from './circuitBreaker.ts';
export { inMemoryTransport, workerTransport } from './workerTransport.ts';
export type { WorkerTransport } from './workerTransport.ts';
export { createEngineWorker } from './worker/engineWorker.ts';
export type { EngineWorker } from './worker/engineWorker.ts';
export type { CellDescriptor, WorkbookDescriptor, WorkerRequest, WorkerResponse } from './worker/protocol.ts';
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
