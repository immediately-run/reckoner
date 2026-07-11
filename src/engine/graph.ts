// Build the dependency graph from a workbook of registered cells (ARCHITECTURE_PLAN §4.2,
// F1/C-4). Each cell/test becomes a node; its declared inputs become internal edges (to
// other cells) or external inputs (feeds/fixtures/static/params). A `<worksheet>.*`
// wildcard is expanded to every cell of that worksheet at build time, so the conservative
// dependency set is **statically enumerable** — the invariant the SCC cycle check and the
// deadlock-freedom argument rest on.
//
// Two enumerability invariants are enforced fail-closed (C-4): (a) a worksheet may not be
// named a reserved namespace (`params`/`feeds`/…) — that would let a cell masquerade as a
// leaf input and hide a producer edge from the static SCC; (b) namespace tokens come from
// `parseInput` and are already compile-time literals, so nothing here resolves a wildcard
// from a runtime value.

import type {
  DependencyGraph,
  GraphDiagnostic,
  GraphNode,
  InputResolver,
  NodeDef,
  Workbook,
} from './types.ts';
import type { InputSpec } from '../stdlib/inputs.ts';

const RESERVED = new Set(['feeds', 'fixtures', 'static', 'params']);

/** The reserved local-input name under which a test node receives its subject's value. */
export const SUBJECT_INPUT = '$subject';

export function buildGraph(workbook: Workbook): DependencyGraph {
  const diagnostics: GraphDiagnostic[] = [];
  const worksheets = new Map<string, string[]>();
  const defsById = new Map<string, { worksheet: string; cell: string; def: NodeDef }>();

  // Pass 1 — enumerate nodes and per-worksheet cell lists.
  for (const [worksheet, cells] of Object.entries(workbook)) {
    if (RESERVED.has(worksheet)) {
      diagnostics.push({
        severity: 'error',
        id: worksheet,
        message: `worksheet "${worksheet}" collides with a reserved namespace; rename it.`,
      });
    }
    const names: string[] = [];
    for (const [cell, def] of Object.entries(cells)) {
      const id = `${worksheet}.${cell}`;
      names.push(id);
      defsById.set(id, { worksheet, cell, def });
    }
    worksheets.set(worksheet, names);
  }

  const has = (id: string): boolean => defsById.has(id);
  const nodes = new Map<string, GraphNode>();
  const externalInputs = new Set<string>();

  // Pass 2 — classify each node's inputs into internal edges + external inputs.
  for (const [id, { worksheet, cell, def }] of defsById) {
    const deps = new Set<string>();
    const externals = new Set<string>();
    const resolvers: InputResolver[] = [];

    for (const [name, spec] of Object.entries(def.inputs) as [string, InputSpec][]) {
      classifyInput(name, spec, { id, deps, externals, resolvers, worksheets, has, diagnostics });
    }

    // A test also depends on its subject cell (so it re-runs when the subject changes).
    if (def.kind === 'test') {
      const subject = def.subject;
      if (has(subject)) {
        deps.add(subject);
        resolvers.push({ name: SUBJECT_INPUT, kind: 'cell', nodeId: subject });
      } else {
        diagnostics.push({ severity: 'error', id, message: `test subject "${subject}" does not exist.` });
      }
    }

    for (const key of externals) externalInputs.add(key);
    nodes.set(id, {
      id,
      worksheet,
      cell,
      kind: def.kind,
      def,
      deps: [...deps],
      externals: [...externals],
      resolvers,
    });
  }

  return { nodes, worksheets, externalInputs, diagnostics };
}

interface ClassifyCtx {
  id: string;
  deps: Set<string>;
  externals: Set<string>;
  resolvers: InputResolver[];
  worksheets: Map<string, string[]>;
  has: (id: string) => boolean;
  diagnostics: GraphDiagnostic[];
}

function classifyInput(name: string, spec: InputSpec, ctx: ClassifyCtx): void {
  if (spec.namespace !== 'worksheet') {
    ctx.externals.add(spec.dependency);
    ctx.resolvers.push({ name, kind: 'external', key: spec.dependency });
    return;
  }

  const worksheet = spec.worksheet!;
  if (spec.wildcard) {
    const cells = ctx.worksheets.get(worksheet);
    if (cells === undefined) {
      ctx.diagnostics.push({
        severity: 'error',
        id: ctx.id,
        message: `input "${name}" references unknown worksheet "${worksheet}".`,
      });
      ctx.resolvers.push({ name, kind: 'wildcard', worksheet });
      return;
    }
    for (const dep of cells) if (dep !== ctx.id) ctx.deps.add(dep);
    ctx.resolvers.push({ name, kind: 'wildcard', worksheet });
    return;
  }

  const nodeId = `${worksheet}.${spec.cell}`;
  if (!ctx.has(nodeId)) {
    ctx.diagnostics.push({
      severity: 'error',
      id: ctx.id,
      message: `input "${name}" references unknown cell "${nodeId}".`,
    });
  } else {
    ctx.deps.add(nodeId);
  }
  ctx.resolvers.push({ name, kind: 'cell', nodeId });
}
