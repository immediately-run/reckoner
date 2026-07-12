// Chart — binds a `source` to a row set and draws it through the presentational ChartFigure
// (§3.3). Shape guard: a non-table binding is a marked broken tile. The tier slot is reserved
// for the host badge. Encoding (kind + fields) comes from the node's literal attributes.
import type { ComponentNode } from '../../nodes.ts';
import { useSource } from '../bindingsContext.ts';
import { asRows } from '../shape.ts';
import { attrString } from '../attrs.ts';
import { readChartEncoding } from '../chartEncoding.ts';
import ChartFigure from './ChartFigure.tsx';
import BrokenTile from './BrokenTile.tsx';
import TierSlot from './TierSlot.tsx';

export default function Chart({ node }: { node: ComponentNode }) {
  const source = attrString(node, 'source');
  const bound = useSource(source);
  const enc = readChartEncoding(node);

  if (bound.status !== 'ok') {
    return <BrokenTile component="Chart" reason={bound.message ?? 'unavailable'} variant={bound.status === 'missing' ? 'needs-access' : 'error'} />;
  }
  const rows = asRows(bound.value);
  if (!rows.ok) return <BrokenTile component="Chart" reason={rows.reason} />;

  return (
    <figure className="rk-tile rk-chart-tile">
      <TierSlot tier={bound.tier} />
      <ChartFigure rows={rows.data} enc={enc} ariaLabel={`${enc.kind} of ${source ?? ''}`} />
    </figure>
  );
}
