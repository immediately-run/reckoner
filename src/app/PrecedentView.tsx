// The precedent-neighborhood view (review-1 UX-4) — the whole subgraph at once, spatially
// nested, alongside the inspector's hop-by-hop chips. Cell nodes navigate on click; externals
// are leaves. Truncation is stated, never silent (a capped unroll says so).
import type { PrecedentNode } from '../engine/precedents.ts';
import type { PrecedentTree } from '../engine/precedents.ts';
import './workbook-panel.css';

interface PrecedentViewProps {
  tree: PrecedentTree;
  onNavigate: (cellId: string) => void;
}

function nodeLabel(id: string): string {
  return id.includes('.') ? id.slice(id.indexOf('.') + 1) : id;
}

function nodeNamespace(id: string): string {
  return id.includes('.') ? id.slice(0, id.indexOf('.')) : '';
}

function Nodes({ nodes, onNavigate }: { nodes: readonly PrecedentNode[]; onNavigate: (id: string) => void }) {
  return (
    <ul className="rk-prec-list">
      {nodes.map((n) => (
        <li key={`${n.via}:${n.id}`} className={`rk-prec-node rk-prec-node--${n.kind}`}>
          {n.kind === 'cell' ? (
            <button type="button" className="rk-prec-cell" onClick={() => onNavigate(n.id)}>
              <span className="rk-prec-via">{n.via}:</span> {nodeLabel(n.id)}
              {n.detail !== undefined && <span className="rk-prec-detail"> ({n.detail})</span>}
            </button>
          ) : (
            <span className="rk-prec-leaf">
              <span className="rk-prec-via">{n.via}:</span> {nodeNamespace(n.id)}.{nodeLabel(n.id)}
              {n.detail !== undefined && <span className="rk-prec-detail"> · {n.detail}</span>}
            </span>
          )}
          {n.children.length > 0 && <Nodes nodes={n.children} onNavigate={onNavigate} />}
        </li>
      ))}
    </ul>
  );
}

function PrecedentView({ tree, onNavigate }: PrecedentViewProps) {
  return (
    <div className="rk-prec" aria-label="Precedent neighborhood">
      <div className="rk-prec-meta">
        {tree.nodeCount} nodes · depth {tree.depth}
        {tree.truncated && <span className="rk-prec-truncated"> — deep DAG truncated at {tree.nodeCount} nodes</span>}
      </div>
      <Nodes nodes={tree.root.children} onNavigate={onNavigate} />
    </div>
  );
}

export default PrecedentView;
