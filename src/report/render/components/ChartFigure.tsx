// The presentational SVG chart (§3.3.1 "SVG-first charts"): resolution-independent, accessible
// (DOM + ARIA), tokens-styled, and driven purely by rows + an encoding — no binding, no engine.
// `Chart` (bound) and `Facets` (row subsets) both draw through this. Every kind in the catalog
// is here: bar (grouped/stacked/normalized), line, area, scatter, histogram, pie (≤5 slices).
//
// Responsive by container: the SVG has a fixed viewBox and scales to 100% width; the density
// ladder (wide → medium → narrow) trims the legend/labels via ResizeObserver. Resize is a pure
// view op (resize ≠ recompute).
import type { Row } from '../../../stdlib/types.ts';
import type { ChartEncoding } from '../chartEncoding.ts';
import { linearScale, niceDomain, ticks, categories, seriesByColor, histogram, pieSlices } from '../chartMath.ts';
import { numericField, labelField } from '../shape.ts';
import { seriesColor } from '../palette.ts';
import { formatNumber } from '../format.ts';
import { useContainerWidth, densityFor } from '../useContainerWidth.ts';

const W = 720;
const H = 340;
const M = { top: 16, right: 20, bottom: 44, left: 60 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

type Density = 'wide' | 'medium' | 'narrow';

function tickLabel(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return formatNumber(n);
}

// Cartesian frame: y gridlines + labels, and a baseline. Returns the y-scale for callers.
function YAxis({ domain }: { domain: [number, number] }) {
  const y = linearScale(domain, [M.top + PH, M.top]);
  return (
    <g className="rk-chart-axis" aria-hidden="true">
      {ticks(domain, 4).map((t, i) => (
        <g key={i}>
          <line x1={M.left} x2={M.left + PW} y1={y(t)} y2={y(t)} className="rk-chart-grid" />
          <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="rk-chart-tick">
            {tickLabel(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

function XCategoryLabels({ cats, band, density }: { cats: string[]; band: (i: number) => number; density: Density }) {
  const stride = density === 'narrow' ? Math.ceil(cats.length / 4) : density === 'medium' ? Math.ceil(cats.length / 8) : 1;
  return (
    <g className="rk-chart-axis" aria-hidden="true">
      {cats.map((c, i) =>
        i % stride === 0 ? (
          <text key={i} x={band(i)} y={M.top + PH + 18} textAnchor="middle" className="rk-chart-tick">
            {c.length > 10 ? `${c.slice(0, 9)}…` : c}
          </text>
        ) : null,
      )}
    </g>
  );
}

function Legend({ names, density }: { names: string[]; density: Density }) {
  if (density === 'narrow' || names.length <= 1 || names.every((n) => n === '')) return null;
  return (
    <g className="rk-chart-legend">
      {names.map((n, i) => (
        <g key={i} transform={`translate(${M.left + i * 130}, ${H - 6})`}>
          <rect width={11} height={11} y={-10} rx={2} fill={seriesColor(i)} />
          <text x={16} className="rk-chart-tick">
            {n.length > 12 ? `${n.slice(0, 11)}…` : n}
          </text>
        </g>
      ))}
    </g>
  );
}

function BarChart({ rows, enc, density }: { rows: Row[]; enc: ChartEncoding; density: Density }) {
  const xf = enc.x ?? 'x';
  const yf = enc.y ?? 'y';
  const cats = categories(rows, xf);
  const series = seriesByColor(rows, enc.color);
  const bandW = PW / Math.max(1, cats.length);
  const bandX = (i: number): number => M.left + bandW * i + bandW / 2;

  // Index rows by (category, series) for stacking / grouping.
  const at = (si: number, ci: number): number => {
    const cat = cats[ci];
    const r = series[si].rows.find((row) => labelField(row, xf) === cat);
    return r ? numericField(r, yf) ?? 0 : 0;
  };

  if (enc.stack === 'none') {
    const inner = bandW * 0.7;
    const gw = inner / series.length;
    const domain = niceDomain(rows.map((r) => numericField(r, yf)));
    const y = linearScale(domain, [M.top + PH, M.top]);
    const y0 = y(Math.max(domain[0], 0));
    return (
      <>
        <YAxis domain={domain} />
        {series.map((_s, si) =>
          cats.map((_, ci) => {
            const v = at(si, ci);
            const yv = y(v);
            const x = M.left + bandW * ci + (bandW - inner) / 2 + gw * si;
            return <rect key={`${si}-${ci}`} x={x} y={Math.min(yv, y0)} width={Math.max(0, gw - 1)} height={Math.abs(yv - y0)} fill={seriesColor(si)} />;
          }),
        )}
        <XCategoryLabels cats={cats} band={bandX} density={density} />
        <Legend names={series.map((s) => s.name)} density={density} />
      </>
    );
  }

  // stacked / normalized
  const totals = cats.map((_, ci) => series.reduce((acc, _s, si) => acc + Math.max(0, at(si, ci)), 0));
  const domain: [number, number] = enc.stack === 'normalized' ? [0, 1] : [0, Math.max(1, ...totals)];
  const y = linearScale(domain, [M.top + PH, M.top]);
  const barW = bandW * 0.7;
  return (
    <>
      <YAxis domain={domain} />
      {cats.map((_, ci) => {
        let acc = 0;
        const total = enc.stack === 'normalized' ? totals[ci] || 1 : 1;
        return series.map((_s, si) => {
          const raw = Math.max(0, at(si, ci));
          const v = enc.stack === 'normalized' ? raw / total : raw;
          const yTop = y(acc + v);
          const yBot = y(acc);
          acc += v;
          const x = M.left + bandW * ci + (bandW - barW) / 2;
          return <rect key={`${si}-${ci}`} x={x} y={yTop} width={barW} height={Math.max(0, yBot - yTop)} fill={seriesColor(si)} />;
        });
      })}
      <XCategoryLabels cats={cats} band={bandX} density={density} />
      <Legend names={series.map((s) => s.name)} density={density} />
    </>
  );
}

function LineArea({ rows, enc, density }: { rows: Row[]; enc: ChartEncoding; density: Density }) {
  const xf = enc.x ?? 'x';
  const yf = enc.y ?? 'y';
  const cats = categories(rows, xf);
  const series = seriesByColor(rows, enc.color);
  const bandW = PW / Math.max(1, cats.length - 1 || 1);
  const px = (cat: string): number => M.left + bandW * Math.max(0, cats.indexOf(cat));
  const domain = niceDomain(rows.map((r) => numericField(r, yf)));
  const y = linearScale(domain, [M.top + PH, M.top]);
  const y0 = y(Math.max(domain[0], 0));

  return (
    <>
      <YAxis domain={domain} />
      {series.map((s, si) => {
        const pts = s.rows
          .map((r) => ({ x: px(labelField(r, xf)), y: numericField(r, yf) }))
          .filter((p): p is { x: number; y: number } => p.y !== null)
          .map((p) => ({ x: p.x, y: y(p.y) }));
        if (pts.length === 0) return null;
        const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        const color = seriesColor(si);
        return (
          <g key={si}>
            {enc.kind === 'area' && (
              <path d={`${line} L ${pts[pts.length - 1].x.toFixed(1)} ${y0.toFixed(1)} L ${pts[0].x.toFixed(1)} ${y0.toFixed(1)} Z`} fill={color} fillOpacity={0.18} />
            )}
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
      <XCategoryLabels cats={cats} band={(i) => M.left + bandW * i} density={density} />
      <Legend names={series.map((s) => s.name)} density={density} />
    </>
  );
}

function Scatter({ rows, enc, density }: { rows: Row[]; enc: ChartEncoding; density: Density }) {
  const xf = enc.x ?? 'x';
  const yf = enc.y ?? 'y';
  const series = seriesByColor(rows, enc.color);
  const xd = niceDomain(rows.map((r) => numericField(r, xf)));
  const yd = niceDomain(rows.map((r) => numericField(r, yf)));
  const x = linearScale(xd, [M.left, M.left + PW]);
  const y = linearScale(yd, [M.top + PH, M.top]);
  const sizes = enc.size ? rows.map((r) => numericField(r, enc.size!) ?? 0) : [];
  const sMax = sizes.length ? Math.max(1, ...sizes) : 1;
  const radius = (r: Row): number => (enc.size ? 3 + 9 * Math.sqrt(Math.max(0, (numericField(r, enc.size) ?? 0) / sMax)) : 4);
  return (
    <>
      <YAxis domain={yd} />
      {series.map((s, si) =>
        s.rows.map((r, ri) => {
          const xv = numericField(r, xf);
          const yv = numericField(r, yf);
          if (xv === null || yv === null) return null;
          return <circle key={`${si}-${ri}`} cx={x(xv)} cy={y(yv)} r={radius(r)} fill={seriesColor(si)} fillOpacity={0.7} />;
        }),
      )}
      <g className="rk-chart-axis" aria-hidden="true">
        {ticks(xd, density === 'narrow' ? 2 : 4).map((t, i) => (
          <text key={i} x={x(t)} y={M.top + PH + 18} textAnchor="middle" className="rk-chart-tick">
            {tickLabel(t)}
          </text>
        ))}
      </g>
      <Legend names={series.map((s) => s.name)} density={density} />
    </>
  );
}

function HistogramChart({ rows, enc }: { rows: Row[]; enc: ChartEncoding }) {
  const vf = enc.value ?? 'value';
  const bins = histogram(rows, vf, enc.bins);
  const domain = niceDomain(bins.map((b) => b.count));
  const y = linearScale(domain, [M.top + PH, M.top]);
  const y0 = y(0);
  const bw = PW / Math.max(1, bins.length);
  return (
    <>
      <YAxis domain={domain} />
      {bins.map((b, i) => {
        const yv = y(b.count);
        return <rect key={i} x={M.left + bw * i + 1} y={yv} width={Math.max(0, bw - 2)} height={Math.max(0, y0 - yv)} fill={seriesColor(0)} />;
      })}
    </>
  );
}

// Precompute wedge paths without mutating render-scope state (react-hooks/immutability).
function pieArcs(slices: { label: string; value: number }[], cx: number, cy: number, r: number): string[] {
  const total = slices.reduce((acc, s) => acc + s.value, 0) || 1;
  const paths: string[] = [];
  let a0 = -Math.PI / 2;
  for (const s of slices) {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    paths.push(`M ${cx} ${cy} L ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${r} ${r} 0 ${large} 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} Z`);
    a0 = a1;
  }
  return paths;
}

function PieChart({ rows, enc, density }: { rows: Row[]; enc: ChartEncoding; density: Density }) {
  const vf = enc.value ?? 'value';
  const lf = enc.label ?? 'label';
  const slices = pieSlices(rows, vf, lf);
  const cx = M.left + PW / 2;
  const cy = M.top + PH / 2;
  const r = Math.min(PW, PH) / 2 - 6;
  const arcs = pieArcs(slices, cx, cy, r);
  return (
    <>
      <g>
        {arcs.map((d, i) => (
          <path key={i} d={d} fill={seriesColor(i)} stroke="var(--panel, #13141d)" strokeWidth={1.5} />
        ))}
      </g>
      <Legend names={slices.map((s) => s.label)} density={density} />
    </>
  );
}

export default function ChartFigure({ rows, enc, ariaLabel }: { rows: Row[]; enc: ChartEncoding; ariaLabel?: string }) {
  const { ref, width } = useContainerWidth(W);
  const density = densityFor(width);
  const label = ariaLabel ?? `${enc.kind} chart`;

  if (rows.length === 0) {
    return (
      <div className="rk-chart rk-chart-empty" ref={ref}>
        <span className="rk-broken-reason">no data</span>
      </div>
    );
  }

  let body: React.ReactNode;
  switch (enc.kind) {
    case 'bar':
      body = <BarChart rows={rows} enc={enc} density={density} />;
      break;
    case 'line':
    case 'area':
      body = <LineArea rows={rows} enc={enc} density={density} />;
      break;
    case 'scatter':
      body = <Scatter rows={rows} enc={enc} density={density} />;
      break;
    case 'histogram':
      body = <HistogramChart rows={rows} enc={enc} />;
      break;
    case 'pie':
      body = <PieChart rows={rows} enc={enc} density={density} />;
      break;
  }

  return (
    <div className="rk-chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="rk-chart-svg" role="img" aria-label={label}>
        {body}
      </svg>
    </div>
  );
}
