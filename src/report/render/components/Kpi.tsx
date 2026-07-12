// Kpi — the "just show the number" stat card (§3.3). Binds a scalar `source`, optionally a
// scalar `compare` (prior value) rendered as a signed relative delta. `format` selects
// number/currency/percent. The tier slot is reserved for the host badge (never drawn here).
// A non-scalar or non-ok binding degrades to a marked broken tile.
import type { ComponentNode } from '../../nodes.ts';
import { useSource } from '../bindingsContext.ts';
import { asScalar } from '../shape.ts';
import { attrString } from '../attrs.ts';
import { formatScalar, formatDelta } from '../format.ts';
import type { NumberFormat } from '../format.ts';
import BrokenTile from './BrokenTile.tsx';
import TierSlot from './TierSlot.tsx';

export default function Kpi({ node }: { node: ComponentNode }) {
  const source = attrString(node, 'source');
  const format = (attrString(node, 'format') ?? 'number') as NumberFormat;
  const bound = useSource(source);
  const compare = useSource(attrString(node, 'compare'));

  if (bound.status !== 'ok') {
    return <BrokenTile component="Kpi" reason={bound.message ?? 'unavailable'} variant={bound.status === 'missing' ? 'needs-access' : 'error'} />;
  }
  const scalar = asScalar(bound.value);
  if (!scalar.ok) return <BrokenTile component="Kpi" reason={scalar.reason} />;

  const showDelta = compare.status === 'ok' && typeof compare.value === 'number' && typeof scalar.data === 'number';
  const delta = showDelta ? formatDelta(scalar.data as number, compare.value as number, format) : undefined;

  return (
    <div className="rk-kpi rk-tile">
      <TierSlot tier={bound.tier} />
      <div className="rk-kpi-value">{formatScalar(scalar.data, format)}</div>
      {delta && (
        <div className="rk-kpi-delta" data-direction={delta.direction}>
          {delta.label}
        </div>
      )}
    </div>
  );
}
