// Map — geographic display (§3.3), registered under the catalog name `Map`. Two kinds:
//   • point — plots lat/lon on an equirectangular plane (SVG), value → mark size.
//   • choropleth — v1 ships a **region breakdown**: ranked horizontal bars per region, colored
//     by a sequential value scale. Real polygon geography needs a boundary atlas (topojson);
//     that is a deferred enrichment (noted in src/report/index.ts). The breakdown is honest,
//     legible, and degrades cleanly — never a blank map. Non-table / non-ok source → broken tile.
import type { ComponentNode } from '../../nodes.ts';
import { useSource } from '../bindingsContext.ts';
import { asRows, numericField, labelField } from '../shape.ts';
import { attrString } from '../attrs.ts';
import { formatNumber } from '../format.ts';
import { linearScale, niceDomain } from '../chartMath.ts';
import { sequentialColor, seriesColor } from '../palette.ts';
import BrokenTile from './BrokenTile.tsx';
import TierSlot from './TierSlot.tsx';

export default function GeoMap({ node }: { node: ComponentNode }) {
  const kind = attrString(node, 'kind') === 'point' ? 'point' : 'choropleth';
  const bound = useSource(attrString(node, 'source'));

  if (bound.status !== 'ok') {
    return <BrokenTile component="Map" reason={bound.message ?? 'unavailable'} variant={bound.status === 'missing' ? 'needs-access' : 'error'} />;
  }
  const rows = asRows(bound.value);
  if (!rows.ok) return <BrokenTile component="Map" reason={rows.reason} />;

  if (kind === 'point') {
    const latF = attrString(node, 'lat') ?? 'lat';
    const lonF = attrString(node, 'lon') ?? 'lon';
    const valF = attrString(node, 'value');
    const lonD = niceDomain(rows.data.map((r) => numericField(r, lonF)));
    const latD = niceDomain(rows.data.map((r) => numericField(r, latF)));
    const x = linearScale(lonD, [20, 700]);
    const y = linearScale(latD, [190, 20]); // lat grows up
    const vals = valF ? rows.data.map((r) => numericField(r, valF) ?? 0) : [];
    const vMax = vals.length ? Math.max(1, ...vals) : 1;
    return (
      <figure className="rk-tile rk-map">
        <TierSlot tier={bound.tier} />
        <svg viewBox="0 0 720 210" preserveAspectRatio="xMidYMid meet" className="rk-chart-svg" role="img" aria-label="point map">
          <rect x={0} y={0} width={720} height={210} className="rk-map-bg" />
          {rows.data.map((r, i) => {
            const lon = numericField(r, lonF);
            const lat = numericField(r, latF);
            if (lon === null || lat === null) return null;
            const rad = valF ? 3 + 9 * Math.sqrt(Math.max(0, (numericField(r, valF) ?? 0) / vMax)) : 5;
            return <circle key={i} cx={x(lon)} cy={y(lat)} r={rad} fill={seriesColor(0)} fillOpacity={0.7} />;
          })}
        </svg>
      </figure>
    );
  }

  // choropleth → region breakdown
  const regionF = attrString(node, 'region') ?? 'region';
  const valF = attrString(node, 'value') ?? 'value';
  const items = rows.data
    .map((r) => ({ region: labelField(r, regionF), value: numericField(r, valF) ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...items.map((it) => it.value));
  return (
    <figure className="rk-tile rk-map rk-map-breakdown">
      <TierSlot tier={bound.tier} />
      <ul className="rk-map-rows">
        {items.map((it, i) => (
          <li key={i} className="rk-map-row">
            <span className="rk-map-region">{it.region}</span>
            <span className="rk-map-bar">
              <span className="rk-map-fill" style={{ width: `${(it.value / max) * 100}%`, background: sequentialColor(it.value / max) }} />
            </span>
            <span className="rk-map-val">{formatNumber(it.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
