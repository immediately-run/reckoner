// Screening tools (ARCHITECTURE_PLAN §3.2, §8.3 — assistant-facing). The computed
// message-finding primitives an author (or the assistant) reaches for to surface what a
// dataset is *saying*: is it trending, where are the anomalies, what moved. They are
// themselves pure formulas over plain rows — no ambient state, same inputs → same output.

import type { Row, Value } from './types.ts';
import { numbers } from './internal.ts';
import { safeDiv } from './nulls.ts';

export interface Trend extends Record<string, Value> {
  first: Value;
  last: Value;
  change: Value;
  /** Fractional change relative to |first| (null when first is 0/absent). */
  pct: Value;
  /** Least-squares slope over the row index. */
  slope: Value;
  direction: 'up' | 'down' | 'flat';
}

/**
 * Summarize the trend of a numeric column over the rows' current order: first/last, absolute
 * and relative change, the least-squares slope, and a direction. Sort first if order matters.
 */
export function trend(rows: Row[], opts: { value: string }): Trend {
  const xs = numbers(rows, opts.value);
  if (xs.length === 0) {
    return { first: null, last: null, change: null, pct: null, slope: null, direction: 'flat' };
  }
  const first = xs[0];
  const last = xs[xs.length - 1];
  const change = last - first;
  const pct = safeDiv(change, Math.abs(first));

  const n = xs.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((y, i) => {
    sx += i;
    sy += y;
    sxy += i * y;
    sxx += i * i;
  });
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const direction = slope > 0 ? 'up' : slope < 0 ? 'down' : 'flat';
  return { first, last, change, pct, slope, direction };
}

/**
 * The rows whose `value` is a statistical outlier. `iqr` (default) flags values outside
 * `[Q1 − k·IQR, Q3 + k·IQR]` (k = 1.5); `zscore` flags `|z| > k` (k = 3). Non-numeric rows
 * are never flagged.
 */
export function outliers(
  rows: Row[],
  opts: { value: string; method?: 'iqr' | 'zscore'; k?: number },
): Row[] {
  const method = opts.method ?? 'iqr';
  const vals = rows.map((r) => {
    const v = r[opts.value];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });
  const finite = vals.filter((v): v is number => v !== null);
  if (finite.length === 0) return [];

  let isOutlier: (v: number) => boolean;
  if (method === 'zscore') {
    const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
    const variance = finite.reduce((a, b) => a + (b - mean) ** 2, 0) / finite.length;
    const sd = Math.sqrt(variance);
    const k = opts.k ?? 3;
    isOutlier = (v) => sd !== 0 && Math.abs((v - mean) / sd) > k;
  } else {
    const sorted = finite.slice().sort((a, b) => a - b);
    const q = (p: number): number => {
      const pos = p * (sorted.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return lo === hi ? sorted[lo] : sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
    };
    const q1 = q(0.25);
    const q3 = q(0.75);
    const iqr = q3 - q1;
    const k = opts.k ?? 1.5;
    const lo = q1 - k * iqr;
    const hi = q3 + k * iqr;
    isOutlier = (v) => v < lo || v > hi;
  }

  return rows.filter((_, i) => vals[i] !== null && isOutlier(vals[i] as number));
}

/**
 * Add period-over-period `delta` (current − previous) and `pct` (delta ÷ |previous|)
 * columns over the rows' current order. The first row's delta/pct are `null`. Sort first if
 * order matters.
 */
export function deltas(
  rows: Row[],
  opts: { value: string; as?: string; pctAs?: string },
): Row[] {
  const as = opts.as ?? 'delta';
  const pctAs = opts.pctAs ?? 'pct';
  let prev: number | null = null;
  return rows.map((r) => {
    const v = r[opts.value];
    const cur = typeof v === 'number' && Number.isFinite(v) ? v : null;
    const delta = cur !== null && prev !== null ? cur - prev : null;
    const pct = delta !== null && prev !== null ? safeDiv(delta, Math.abs(prev)) : null;
    const out: Row = { ...r, [as]: delta, [pctAs]: pct };
    prev = cur;
    return out;
  });
}
