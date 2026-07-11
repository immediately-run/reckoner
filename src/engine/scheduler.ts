// The recalc scheduler core (ARCHITECTURE_PLAN §4.2). Pure decision logic over the
// dependency graph; the effectful evaluator (the SES compartment that runs a formula) is
// injected as a port, so this whole module is unit-testable without a worker. It owns:
//
//   - topological recompute order (dependencies before dependents);
//   - the **tier fold** — a node's tier is the floor over its input tiers (RQ-B4);
//   - **`(value-key, tier)` early cutoff** (F4): a recomputed node propagates to its
//     dependents only when that pair changes — an unchanged value with a changed tier still
//     re-labels downstream, and an unchanged pair prunes the rest of the pass;
//   - **demand-driven incremental recompute** (F5): a feed/param change is a dirty signal;
//     each dependent is rebuilt once, in order, after its inputs settle.
//
// Deferred to the engine shell (async/effectful, out of this pure core): run-to-completion
// single-slot supersession, the common-epoch barrier for glitch-freedom under live feeds,
// and the watchdog circuit breaker (§4.1). The sync topo pass here is the glitch-free case
// by construction — no cell ever observes mixed-epoch inputs because there are no epochs yet.

import type { Value } from '../stdlib/types.ts';
import type {
  DependencyGraph,
  ExternalValue,
  GraphNode,
  PassResult,
  PublishedResult,
} from './types.ts';
import { analyze } from './cycles.ts';
import { contentKey } from './hash.ts';
import { meetTiers } from './tier.ts';
import type { Tier } from './tier.ts';

/** The injected formula evaluator: pure value from resolved inputs (the SES eval in prod). */
export type Evaluator = (node: GraphNode, inputs: Record<string, Value>) => Value;

export class CycleError extends Error {
  readonly cycles: string[][];
  constructor(cycles: string[][]) {
    super(`workbook has dependency cycle(s): ${cycles.map((c) => c.join(' → ')).join('; ')}`);
    this.name = 'CycleError';
    this.cycles = cycles;
  }
}

interface StoredExternal extends ExternalValue {
  key: string;
}

export class Scheduler {
  readonly graph: DependencyGraph;
  readonly order: string[];
  readonly cycles: string[][];

  #results = new Map<string, PublishedResult>();
  #externals = new Map<string, StoredExternal>();

  constructor(graph: DependencyGraph) {
    this.graph = graph;
    const analysis = analyze(graph);
    this.order = analysis.order;
    this.cycles = analysis.cycles;
  }

  /** The published result for a node, if any. */
  result(id: string): PublishedResult | undefined {
    return this.#results.get(id);
  }

  /** Cold build: set all externals and recompute every node in topo order. */
  initial(externals: Record<string, ExternalValue>, evaluate: Evaluator): PassResult {
    this.#assertAcyclic();
    this.#externals.clear();
    for (const [key, ext] of Object.entries(externals)) this.#storeExternal(key, ext);

    const changed: string[] = [];
    for (const id of this.order) {
      if (this.#recompute(id, evaluate)) changed.push(id);
    }
    return { recomputed: [...this.order], changed, results: this.snapshot() };
  }

  /**
   * Incremental pass: merge external updates, then recompute only nodes reachable from a
   * changed input, pruning by `(value-key, tier)` cutoff.
   */
  apply(externalUpdates: Record<string, ExternalValue>, evaluate: Evaluator): PassResult {
    this.#assertAcyclic();

    const changedExternals = new Set<string>();
    for (const [key, ext] of Object.entries(externalUpdates)) {
      if (this.#storeExternal(key, ext)) changedExternals.add(key);
    }

    const changedNodes = new Set<string>();
    const recomputed: string[] = [];
    const changed: string[] = [];
    for (const id of this.order) {
      const node = this.graph.nodes.get(id)!;
      const readsChangedExternal = node.externals.some((e) => changedExternals.has(e));
      const readsChangedDep = node.deps.some((d) => changedNodes.has(d));
      if (!readsChangedExternal && !readsChangedDep) continue; // cutoff: nothing it reads changed
      recomputed.push(id);
      if (this.#recompute(id, evaluate)) {
        changed.push(id);
        changedNodes.add(id);
      }
    }
    return { recomputed, changed, results: this.snapshot() };
  }

  /** A copy of all currently published results. */
  snapshot(): Map<string, PublishedResult> {
    return new Map(this.#results);
  }

  // --- internals -----------------------------------------------------------------

  #assertAcyclic(): void {
    if (this.cycles.length > 0) throw new CycleError(this.cycles);
  }

  #storeExternal(key: string, ext: ExternalValue): boolean {
    const k = contentKey(ext.value);
    const prev = this.#externals.get(key);
    this.#externals.set(key, { value: ext.value, tier: ext.tier, key: k });
    return prev === undefined || prev.key !== k || prev.tier !== ext.tier;
  }

  #recompute(id: string, evaluate: Evaluator): boolean {
    const node = this.graph.nodes.get(id)!;
    const { values, tiers } = this.#resolveInputs(node);
    const value = evaluate(node, values);
    const tier = meetTiers(tiers);
    return this.#publish(id, value, tier);
  }

  #publish(id: string, value: Value, tier: Tier): boolean {
    const key = contentKey(value);
    const prev = this.#results.get(id);
    this.#results.set(id, { id, value, tier, key });
    return prev === undefined || prev.key !== key || prev.tier !== tier;
  }

  #resolveInputs(node: GraphNode): { values: Record<string, Value>; tiers: Tier[] } {
    const values: Record<string, Value> = {};
    const tiers: Tier[] = [];
    for (const r of node.resolvers) {
      if (r.kind === 'external') {
        const ext = this.#externals.get(r.key);
        values[r.name] = ext?.value ?? null;
        tiers.push(ext?.tier ?? 'static');
      } else if (r.kind === 'cell') {
        const res = this.#results.get(r.nodeId);
        values[r.name] = res?.value ?? null;
        tiers.push(res?.tier ?? 'static');
      } else {
        // wildcard: an object of every cell in the worksheet, keyed by short cell name.
        const cells = this.graph.worksheets.get(r.worksheet) ?? [];
        const candidates: Record<string, Value> = {};
        for (const cellId of cells) {
          const res = this.#results.get(cellId);
          candidates[shortName(cellId)] = res?.value ?? null;
          tiers.push(res?.tier ?? 'static');
        }
        values[r.name] = candidates;
      }
    }
    return { values, tiers };
  }
}

function shortName(id: string): string {
  const dot = id.indexOf('.');
  return dot === -1 ? id : id.slice(dot + 1);
}
