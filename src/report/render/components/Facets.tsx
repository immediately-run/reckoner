// Facets — small-multiples (§3.3: "the endorsed alternative to cramming series"). Binds a
// `source`, partitions its rows by the `by` field, and draws one copy of the wrapped Chart per
// partition through the same ChartFigure. The inner Chart inherits Facets' source (its own is
// omitted, per the validator), so faceting is one binding split many ways — no per-facet
// binding names. Non-table / non-ok source → broken tile.
import type { ComponentNode } from '../../nodes.ts';
import { useSource } from '../bindingsContext.ts';
import { asRows, labelField } from '../shape.ts';
import { attrString } from '../attrs.ts';
import { readChartEncoding } from '../chartEncoding.ts';
import ChartFigure from './ChartFigure.tsx';
import BrokenTile from './BrokenTile.tsx';
import TierSlot from './TierSlot.tsx';

export default function Facets({ node }: { node: ComponentNode }) {
  const source = attrString(node, 'source');
  const by = attrString(node, 'by');
  const bound = useSource(source);

  if (bound.status !== 'ok') {
    return <BrokenTile component="Facets" reason={bound.message ?? 'unavailable'} variant={bound.status === 'missing' ? 'needs-access' : 'error'} />;
  }
  const rows = asRows(bound.value);
  if (!rows.ok) return <BrokenTile component="Facets" reason={rows.reason} />;

  const chart = node.children.find((c): c is ComponentNode => c.type === 'component' && c.name === 'Chart');
  if (chart === undefined) return <BrokenTile component="Facets" reason="expects one <Chart> child" />;
  if (by === undefined) return <BrokenTile component="Facets" reason='missing "by" field' />;
  const enc = readChartEncoding(chart);

  // Partition rows by the facet field, preserving first-seen order.
  const groups = new Map<string, typeof rows.data>();
  const order: string[] = [];
  for (const r of rows.data) {
    const key = labelField(r, by);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(r);
  }

  return (
    <figure className="rk-tile rk-facets">
      <TierSlot tier={bound.tier} />
      <div className="rk-facets-grid">
        {order.map((key) => (
          <div className="rk-facet" key={key}>
            <div className="rk-facet-title">{key}</div>
            <ChartFigure rows={groups.get(key)!} enc={enc} ariaLabel={`${enc.kind} for ${key}`} />
          </div>
        ))}
      </div>
    </figure>
  );
}
