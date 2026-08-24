// The precedent-tree builder (review-1 UX-4). Pure over cell descriptors: the DAG unrolled
// as a tree, externals as leaves, wildcards expanded, bounded with an honest truncation flag.
import { describe, it, expect } from 'vitest';
import { precedentTree } from './precedents.ts';
import type { CellDescriptor } from './worker/protocol.ts';
import type { InputResolver } from './types.ts';

function cellOf(id: string, resolvers: InputResolver[]): CellDescriptor {
  const [worksheet, cell] = id.split('.');
  return {
    id,
    worksheet,
    cell,
    doc: '',
    formulaSource: '',
    deps: resolvers.filter((r) => r.kind === 'cell').map((r) => (r as { nodeId: string }).nodeId),
    externals: resolvers.filter((r) => r.kind === 'external').map((r) => (r as { key: string }).key),
    resolvers,
  };
}

const ext = (name: string, key: string): InputResolver => ({ name, kind: 'external', key });
const ref = (name: string, nodeId: string): InputResolver => ({ name, kind: 'cell', nodeId });

describe('precedentTree', () => {
  it('a linear chain unrolls to the leaves', () => {
    const cells = [
      cellOf('r.c', [ref('b', 'r.b')]),
      cellOf('r.b', [ref('a', 'r.a')]),
      cellOf('r.a', [ext('rows', 'feeds.orders')]),
    ];
    const t = precedentTree('r.c', cells);
    expect(t.root.children).toHaveLength(1);
    expect(t.root.children[0].id).toBe('r.b');
    expect(t.root.children[0].children[0].id).toBe('r.a');
    expect(t.root.children[0].children[0].children[0]).toMatchObject({ id: 'feeds.orders', kind: 'external', via: 'rows' });
    expect(t.depth).toBe(3); // c → b → a → leaf
    expect(t.truncated).toBe(false);
  });

  it('a diamond repeats the shared node in both arms (the DAG unrolled as a tree)', () => {
    const cells = [
      cellOf('r.d', [ref('left', 'r.b'), ref('right', 'r.c')]),
      cellOf('r.b', [ref('a', 'r.a')]),
      cellOf('r.c', [ref('a', 'r.a')]),
      cellOf('r.a', [ext('rows', 'fixtures.data')]),
    ];
    const t = precedentTree('r.d', cells);
    const ids: string[] = [];
    const walk = (n: typeof t.root): void => {
      ids.push(n.id);
      n.children.forEach(walk);
    };
    walk(t.root);
    expect(ids.filter((i) => i === 'r.a')).toHaveLength(2); // appears in both arms
    expect(ids.filter((i) => i === 'fixtures.data')).toHaveLength(2);
  });

  it('wildcards expand to their worksheet\'s cells, marked with the worksheet detail', () => {
    const cells = [
      cellOf('r.headline', [{ name: 'cands', kind: 'wildcard', worksheet: 'data' }]),
      cellOf('data.x', [ext('rows', 'feeds.orders')]),
      cellOf('data.y', [ext('rows', 'feeds.orders')]),
    ];
    const t = precedentTree('r.headline', cells);
    expect(t.root.children.map((c) => c.id).sort()).toEqual(['data.x', 'data.y']);
    expect(t.root.children.every((c) => c.detail === 'data.*')).toBe(true);
  });

  it('windowed-feed inputs leaf with their window as the detail', () => {
    const cells = [cellOf('r.recent', [{ name: 'tail', kind: 'windowed-feed', feed: 'orders', window: '1h', by: 'ts' }])];
    const t = precedentTree('r.recent', cells);
    expect(t.root.children[0]).toMatchObject({ id: 'feeds.orders', kind: 'external', detail: '1h' });
  });

  it('the node cap truncates and says so', () => {
    const cells = [
      cellOf('r.deep', [ref('a', 'r.a')]),
      cellOf('r.a', [ref('b', 'r.b')]),
      cellOf('r.b', [ext('x', 'fixtures.x')]),
    ];
    const capped = precedentTree('r.deep', cells, 2); // only enough budget for 2 cell nodes
    expect(capped.truncated).toBe(true);
    expect(capped.nodeCount).toBeLessThanOrEqual(3);
  });

  it('an unknown root yields an empty tree, not a throw', () => {
    const t = precedentTree('ghost.x', [cellOf('r.a', [])]);
    expect(t.root.children).toEqual([]);
    expect(t.nodeCount).toBe(0);
  });
});
