// Flow — a data-positioned node/edge diagram (§3.3): stations as nodes, connections as edges,
// each edge optionally annotated (label + mono value, an inventory triangle for a buffer, the
// danger color for an alert). Binds two row sets — `nodes` and `edges` — and draws exactly
// the coordinates they carry: no auto-layout (flowGeometry.ts holds the rationale and all the
// geometry). Any malformed row, unknown node id or over-cap table is a marked broken tile
// naming the first offender — never a partial drawing. The wide diagram scrolls
// horizontally inside its tile on a narrow screen instead of shrinking its text away.
import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { ComponentNode } from '../../nodes.ts';
import { useSource } from '../bindingsContext.ts';
import { asRows } from '../shape.ts';
import { attrString } from '../attrs.ts';
import { flowAriaLabel, planFlow, readFlow, FLOW_TONES } from '../flowGeometry.ts';
import type { FlowNode } from '../flowGeometry.ts';
import BrokenTile from './BrokenTile.tsx';
import TierSlot from './TierSlot.tsx';

/** Below this width the diagram stops shrinking and scrolls instead (px). */
const MIN_RENDER_W = 720;

function NodeShape({ n }: { n: FlowNode }) {
  const { x, y, w, h } = n;
  switch (n.shape) {
    case 'pill':
      return <rect className="rk-flow-node-shape" x={x} y={y} width={w} height={h} rx={h / 2} />;
    case 'diamond':
      return <polygon className="rk-flow-node-shape" points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`} />;
    case 'note': {
      const f = Math.min(14, w / 4, h / 4);
      return <path className="rk-flow-node-shape" d={`M${x} ${y} H${x + w - f} L${x + w} ${y + f} V${y + h} H${x} Z`} />;
    }
    default:
      return <rect className="rk-flow-node-shape" x={x} y={y} width={w} height={h} rx={8} />;
  }
}

export default function Flow({ node }: { node: ComponentNode }) {
  const nodesBound = useSource(attrString(node, 'nodes'));
  const edgesBound = useSource(attrString(node, 'edges'));
  const title = attrString(node, 'title');
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  for (const bound of [nodesBound, edgesBound]) {
    if (bound.status !== 'ok') {
      return <BrokenTile component="Flow" reason={bound.message ?? 'unavailable'} variant={bound.status === 'missing' ? 'needs-access' : 'error'} />;
    }
  }
  const nodeRows = asRows(nodesBound.value);
  if (!nodeRows.ok) return <BrokenTile component="Flow" reason={`nodes: ${nodeRows.reason}`} />;
  const edgeRows = asRows(edgesBound.value);
  if (!edgeRows.ok) return <BrokenTile component="Flow" reason={`edges: ${edgeRows.reason}`} />;
  const model = readFlow(nodeRows.data, edgeRows.data);
  if (!model.ok) return <BrokenTile component="Flow" reason={model.reason} />;

  const plan = planFlow(model.data);
  const vb = plan.viewBox;
  const marker = (tone: string): string => `rk-flow-arrow-${uid}-${tone}`;
  // The natural width (1 unit = 1 px) sizes the svg: never upscaled past it, never squeezed
  // below MIN_RENDER_W (the scroller takes over there).
  const size = { '--rk-flow-w': `${Math.ceil(vb.w)}px`, '--rk-flow-min': `${Math.min(Math.ceil(vb.w), MIN_RENDER_W)}px` } as CSSProperties;

  return (
    <figure className="rk-tile rk-flow">
      <TierSlot tier={nodesBound.tier} />
      <div className="rk-flow-scroll">
        <svg
          className="rk-flow-svg"
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          role="img"
          aria-label={flowAriaLabel(title, plan)}
          style={size}
        >
          <defs>
            {FLOW_TONES.map((tone) => (
              <marker key={tone} id={marker(tone)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path className={`rk-flow-arrow rk-flow-tone-${tone}`} d="M0 0 L10 5 L0 10 Z" />
              </marker>
            ))}
          </defs>
          <g className="rk-flow-edges">
            {plan.edges.map(({ edge, d }, i) => (
              <path
                key={i}
                className={`rk-flow-edge rk-flow-tone-${edge.tone}${edge.dashed ? ' rk-flow-dashed' : ''}`}
                d={d}
                markerEnd={`url(#${marker(edge.tone)})`}
              />
            ))}
          </g>
          <g className="rk-flow-nodes">
            {plan.nodes.map((n) => {
              const cy = n.y + n.h / 2;
              return (
                <g key={n.id} className={`rk-flow-node rk-flow-tone-${n.tone}`} data-shape={n.shape}>
                  <NodeShape n={n} />
                  <text className="rk-flow-node-label" x={n.x + n.w / 2} y={n.sub ? cy - 4 : cy + 4} textAnchor="middle">
                    {n.label}
                  </text>
                  {n.sub && (
                    <text className="rk-flow-node-sub" x={n.x + n.w / 2} y={cy + 13} textAnchor="middle">
                      {n.sub}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <g className="rk-flow-annotations">
            {plan.edges.map(({ edge, annotation: a }, i) =>
              a === undefined ? null : (
                <g key={i} className={`rk-flow-annotation rk-flow-tone-${edge.tone}${edge.alert ? ' rk-flow-alert' : ''}`}>
                  {a.triangle && <polygon className="rk-flow-buffer" points={a.triangle} />}
                  {a.labelY !== undefined && (
                    <text className="rk-flow-anno-label" x={a.x} y={a.labelY} textAnchor="middle">
                      {edge.label}
                    </text>
                  )}
                  {a.valueY !== undefined && (
                    <text className="rk-flow-anno-value" x={a.x} y={a.valueY} textAnchor="middle">
                      {edge.value}
                    </text>
                  )}
                </g>
              ),
            )}
          </g>
        </svg>
      </div>
    </figure>
  );
}
