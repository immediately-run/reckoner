// Cycle detection + topological ordering (ARCHITECTURE_PLAN §4.2). Cycles are always an
// error in v1 (no iterative/fixpoint calc); the full cycle path is reported. The order is
// computed by Kahn's algorithm (iterative — safe on the deep chains the B1 spike stresses,
// where recursion would overflow); nodes left unemitted are exactly the ones in cycles, and
// a residual DFS reconstructs an ordered cycle path for the diagnostic.

import type { DependencyGraph } from './types.ts';

export interface GraphAnalysis {
  /** Topological order of the acyclic part (dependencies before dependents). */
  order: string[];
  /** One ordered path per cycle found; empty when the graph is a DAG. */
  cycles: string[][];
}

export function analyze(graph: DependencyGraph): GraphAnalysis {
  const ids = [...graph.nodes.keys()];
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of ids) {
    indeg.set(id, 0);
    dependents.set(id, []);
  }
  for (const node of graph.nodes.values()) {
    for (const dep of node.deps) {
      if (!graph.nodes.has(dep)) continue;
      indeg.set(node.id, (indeg.get(node.id) ?? 0) + 1);
      dependents.get(dep)!.push(node.id);
    }
  }

  const order: string[] = [];
  const emitted = new Set<string>();
  const queue = ids.filter((id) => indeg.get(id) === 0);
  let qi = 0;
  while (qi < queue.length) {
    const id = queue[qi++];
    order.push(id);
    emitted.add(id);
    for (const dependent of dependents.get(id)!) {
      const d = indeg.get(dependent)! - 1;
      indeg.set(dependent, d);
      if (d === 0) queue.push(dependent);
    }
  }

  const cyclic = new Set(ids.filter((id) => !emitted.has(id)));
  const cycles = cyclic.size > 0 ? extractCycles(graph, cyclic) : [];
  return { order, cycles };
}

/** True when the graph has at least one cycle. */
export function hasCycle(graph: DependencyGraph): boolean {
  return analyze(graph).cycles.length > 0;
}

function extractCycles(graph: DependencyGraph, cyclic: Set<string>): string[][] {
  const covered = new Set<string>();
  const cycles: string[][] = [];
  for (const start of cyclic) {
    if (covered.has(start)) continue;
    const cycle = walk(graph, cyclic, start);
    if (cycle.length > 0) {
      for (const id of cycle) covered.add(id);
      cycles.push(cycle);
    }
  }
  return cycles;
}

// Iterative DFS within the cyclic residual; returns the first back-edge loop as an
// ordered path (dep-following: each node → the next it depends on).
function walk(graph: DependencyGraph, cyclic: Set<string>, start: string): string[] {
  const onPath = new Set<string>([start]);
  const path = [start];
  const visited = new Set<string>([start]);
  const stack = [{ id: start, i: 0 }];
  const depsOf = (id: string): string[] =>
    (graph.nodes.get(id)?.deps ?? []).filter((d) => cyclic.has(d));

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const ds = depsOf(top.id);
    if (top.i < ds.length) {
      const next = ds[top.i];
      top.i += 1;
      if (onPath.has(next)) {
        return path.slice(path.indexOf(next));
      }
      if (!visited.has(next)) {
        visited.add(next);
        onPath.add(next);
        path.push(next);
        stack.push({ id: next, i: 0 });
      }
    } else {
      onPath.delete(top.id);
      path.pop();
      stack.pop();
    }
  }
  return [];
}
