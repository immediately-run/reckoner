// The precedent neighborhood (review-1 UX-4). Walking a 4-deep precedent chain one panel at
// a time is a regression against Excel's spatial Trace-Precedents, so the inspector offers
// the whole subgraph at once alongside the hop-by-hop chips. Pure: it folds the workbook's
// cell descriptors into a tree — the DAG unrolled as a tree (a diamond's shared node simply
// appears in both arms; cycles cannot occur, the engine rejects them at build), externals
// (`feeds.*`/`fixtures.*`/`params.*`/`static.*`) as the leaves the walk terminates at.
//
// Bounded by construction: a wide DAG unrolls toward exponential node counts, so the builder
// stops at `maxNodes` and reports `truncated` — the view says so rather than silently
// clipping (ways_of_working: no silent caps).

import type { CellDescriptor } from './worker/protocol.ts';

/** One node of the precedent tree: a cell (navigable) or an external leaf. */
export interface PrecedentNode {
  /** Cell id (`revenue.total`) or external key (`feeds.orders`). */
  id: string;
  kind: 'cell' | 'external';
  /** The declared input's local name at this edge (why this node is here). */
  via: string;
  /** Extra context for the label: a windowed feed's window, a wildcard's worksheet. */
  detail?: string;
  children: PrecedentNode[];
}

export interface PrecedentTree {
  root: PrecedentNode;
  /** Nodes actually materialized (the honest count, post-cap). */
  nodeCount: number;
  /** True when the `maxNodes` cap stopped the unroll — the view must say so. */
  truncated: boolean;
  /** The deepest path length (edges), for a one-glance "how deep is this". */
  depth: number;
}

const DEFAULT_MAX_NODES = 200;

/**
 * Build the precedent tree for a cell: every cell input, transitively, with externals as
 * leaves. Wildcards expand to their worksheet's cells (the conservative dependency set the
 * engine itself computes).
 */
export function precedentTree(
  rootId: string,
  cells: readonly CellDescriptor[],
  maxNodes: number = DEFAULT_MAX_NODES,
): PrecedentTree {
  const byId = new Map(cells.map((c) => [c.id, c]));
  const root = byId.get(rootId);
  if (root === undefined) {
    return { root: { id: rootId, kind: 'cell', via: '', children: [] }, nodeCount: 0, truncated: false, depth: 0 };
  }

  let budget = maxNodes;
  let truncated = false;

  const build = (cell: CellDescriptor): PrecedentNode[] => {
    const out: PrecedentNode[] = [];
    for (const r of cell.resolvers) {
      if (budget <= 0) {
        truncated = true;
        break;
      }
      if (r.kind === 'cell') {
        const target = byId.get(r.nodeId);
        budget -= 1;
        out.push({
          id: r.nodeId,
          kind: 'cell',
          via: r.name,
          children: target === undefined ? [] : build(target),
        });
      } else if (r.kind === 'wildcard') {
        const members = cells.filter((c) => c.worksheet === r.worksheet);
        for (const m of members) {
          if (budget <= 0) {
            truncated = true;
            break;
          }
          budget -= 1;
          out.push({
            id: m.id,
            kind: 'cell',
            via: r.name,
            detail: `${r.worksheet}.*`,
            children: build(m),
          });
        }
      } else if (r.kind === 'windowed-feed') {
        out.push({ id: `feeds.${r.feed}`, kind: 'external', via: r.name, detail: r.window, children: [] });
      } else {
        out.push({ id: r.key, kind: 'external', via: r.name, children: [] });
      }
    }
    return out;
  };

  const children = build(root);
  const tree: PrecedentTree = {
    root: { id: rootId, kind: 'cell', via: '', children },
    nodeCount: 1 + (maxNodes - budget),
    truncated,
    depth: 0,
  };
  tree.depth = depthOf(tree.root);
  return tree;
}

function depthOf(node: PrecedentNode): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(depthOf));
}
