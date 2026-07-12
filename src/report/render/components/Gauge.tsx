// Gauge — the single permitted radial (§3.3 anti-affordances: "radial/gauge beyond the one
// KPI gauge" is inexpressible). A KPI-style semicircular arc showing a numeric `source`
// against `min`/`max`. SVG (resolution-independent). Non-numeric / non-ok → broken tile.
import type { ComponentNode } from '../../nodes.ts';
import { useSource } from '../bindingsContext.ts';
import { asNumber } from '../shape.ts';
import { attrString, attrNumber } from '../attrs.ts';
import { formatNumber } from '../format.ts';
import type { NumberFormat } from '../format.ts';
import BrokenTile from './BrokenTile.tsx';
import TierSlot from './TierSlot.tsx';

// Point on a circle of radius r at angle a (radians), centered at (cx,cy). SVG y grows down.
function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

// Semicircle arc path from fraction t0 to t1 of the sweep (π at left → 0 at right).
function arcPath(cx: number, cy: number, r: number, t0: number, t1: number): string {
  const a0 = Math.PI * (1 - t0);
  const a1 = Math.PI * (1 - t1);
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export default function Gauge({ node }: { node: ComponentNode }) {
  const bound = useSource(attrString(node, 'source'));
  const format = (attrString(node, 'format') ?? 'number') as NumberFormat;
  const min = attrNumber(node, 'min') ?? 0;
  const max = attrNumber(node, 'max') ?? 100;

  if (bound.status !== 'ok') {
    return <BrokenTile component="Gauge" reason={bound.message ?? 'unavailable'} variant={bound.status === 'missing' ? 'needs-access' : 'error'} />;
  }
  const num = asNumber(bound.value);
  if (!num.ok) return <BrokenTile component="Gauge" reason={num.reason} />;

  const span = max - min || 1;
  const t = Math.max(0, Math.min(1, (num.data - min) / span));
  const cx = 100;
  const cy = 90;
  const r = 80;

  return (
    <div className="rk-gauge rk-tile">
      <TierSlot tier={bound.tier} />
      <svg viewBox="0 0 200 110" className="rk-gauge-svg" role="img" aria-label={`gauge ${formatNumber(num.data, format)}`}>
        <path d={arcPath(cx, cy, r, 0, 1)} className="rk-gauge-track" fill="none" strokeWidth={14} strokeLinecap="round" />
        {t > 0 && <path d={arcPath(cx, cy, r, 0, t)} className="rk-gauge-fill" fill="none" strokeWidth={14} strokeLinecap="round" />}
      </svg>
      <div className="rk-gauge-value">{formatNumber(num.data, format)}</div>
    </div>
  );
}
