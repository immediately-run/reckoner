// Value formatting for the report components (§3.3). The catalog's `format` enum
// (`number` | `currency` | `percent`) selects a presentation; everything else falls back to
// a compact, locale-default rendering. Pure — no DOM, no engine — so it is unit-testable and
// shared by Kpi / Gauge / Value / Table cells.

import type { Value } from '../../stdlib/types.ts';

export type NumberFormat = 'number' | 'currency' | 'percent';

const NF = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const CF = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const PF = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

/** Format a number by the catalog `format` enum. `percent` treats the value as a ratio. */
export function formatNumber(n: number, format: NumberFormat = 'number'): string {
  if (!Number.isFinite(n)) return '—';
  switch (format) {
    case 'currency':
      return CF.format(n);
    case 'percent':
      return PF.format(n);
    case 'number':
      return NF.format(n);
  }
}

/**
 * Format an arbitrary published cell value for inline / cell display. Scalars render
 * directly; `null` is the empty marker (`—`); a non-scalar (a row set bound where a scalar
 * was expected) is a shape mismatch surfaced by the caller, not stringified here.
 */
export function formatScalar(v: Value, format?: NumberFormat): string {
  if (v === null) return '—';
  if (typeof v === 'number') return formatNumber(v, format);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string') return v;
  return String(v);
}

/** A signed delta label for a KPI compare (`+12.3%` / `−4`). */
export function formatDelta(current: number, previous: number, format: NumberFormat = 'number'): {
  label: string;
  direction: 'up' | 'down' | 'flat';
} {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return { label: '—', direction: 'flat' };
  const diff = current - previous;
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  if (format === 'percent') {
    const label = `${diff >= 0 ? '+' : '−'}${formatNumber(Math.abs(diff), 'percent')}`;
    return { label, direction };
  }
  // Relative change is the useful KPI delta for number/currency.
  if (previous === 0) return { label: diff === 0 ? '0%' : '—', direction };
  const rel = diff / Math.abs(previous);
  return { label: `${diff >= 0 ? '+' : '−'}${formatNumber(Math.abs(rel), 'percent')}`, direction };
}
