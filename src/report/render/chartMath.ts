// Pure geometry for the SVG charts (§3.3.1 "SVG-first charts"). Scales, tick generation, and
// series extraction live here as framework-free functions so the chart component is thin
// wiring and the math is unit-testable in Node. No DOM, no React.

import type { Row } from '../../stdlib/types.ts';
import { numericField, labelField } from './shape.ts';

/** A linear scale over a numeric domain onto a pixel range. */
export interface LinearScale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1; // guard a degenerate (single-value) domain
  const fn = ((v: number): number => r0 + ((v - d0) / span) * (r1 - r0)) as LinearScale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** A "nice" numeric domain that includes 0 when the data is one-signed, padded slightly. */
export function niceDomain(values: readonly (number | null)[]): [number, number] {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length === 0) return [0, 1];
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (min > 0) min = 0; // anchor bars/areas to zero
  if (max < 0) max = 0;
  if (min === max) {
    max = min + 1;
    min = min - 1;
  }
  return [min, max];
}

/** Evenly spaced tick values across a domain (count is a hint; endpoints included). */
export function ticks(domain: [number, number], count: number): number[] {
  const [d0, d1] = domain;
  const n = Math.max(1, Math.floor(count));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(d0 + ((d1 - d0) * i) / n);
  return out;
}

/** Distinct category values for a field, in first-seen order. */
export function categories(rows: Row[], field: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const key = labelField(r, field);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** Split rows into named series by a `color` field; a single unnamed series when absent. */
export function seriesByColor(rows: Row[], colorField: string | undefined): { name: string; rows: Row[] }[] {
  if (colorField === undefined) return [{ name: '', rows }];
  const groups = new Map<string, Row[]>();
  const order: string[] = [];
  for (const r of rows) {
    const key = labelField(r, colorField);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(r);
  }
  return order.map((name) => ({ name, rows: groups.get(name)! }));
}

/**
 * Bucket numeric values into `bins` equal-width bins (histogram). Returns bin ranges +
 * counts; an empty input yields no bins.
 */
export function histogram(rows: Row[], valueField: string, bins: number): { x0: number; x1: number; count: number }[] {
  const nums = rows.map((r) => numericField(r, valueField)).filter((v): v is number => v !== null);
  if (nums.length === 0) return [];
  const n = Math.max(1, Math.floor(bins));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const width = (max - min) / n || 1;
  const out = Array.from({ length: n }, (_, i) => ({ x0: min + i * width, x1: min + (i + 1) * width, count: 0 }));
  for (const v of nums) {
    const idx = Math.min(n - 1, Math.floor((v - min) / width));
    out[idx].count++;
  }
  return out;
}

/**
 * Collapse pie slices to the ≤5-slice rule (§3.3): the largest 5 by value survive; the
 * remainder is summed into a single "other" bucket. Non-positive/null values are dropped.
 */
export function pieSlices(rows: Row[], valueField: string, labelFieldName: string, max = 5): { label: string; value: number }[] {
  const slices = rows
    .map((r) => ({ label: labelField(r, labelFieldName), value: numericField(r, valueField) ?? 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  if (slices.length <= max) return slices;
  const head = slices.slice(0, max - 1);
  const other = slices.slice(max - 1).reduce((acc, s) => acc + s.value, 0);
  return [...head, { label: 'other', value: other }];
}
