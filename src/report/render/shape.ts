// Shape contracts (§3.3 point 4): "a Kpi wants a scalar, a Chart wants rows." A binding that
// resolves to the wrong shape is a **marked broken tile** in view mode (and an authoring
// diagnostic upstream) — never a blank or a crash. These guards turn a resolved value into a
// typed success or a reason string the component renders as a broken tile. Pure.

import type { Row, Scalar, Value } from '../../stdlib/types.ts';

export type ShapeResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Require a scalar (Kpi / Value / Gauge). Rows or objects are a shape mismatch. */
export function asScalar(v: Value): ShapeResult<Scalar> {
  if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
    return { ok: true, data: v };
  }
  return { ok: false, reason: Array.isArray(v) ? 'expected a single value, got a table' : 'expected a single value, got an object' };
}

/** Require a numeric scalar (Gauge). */
export function asNumber(v: Value): ShapeResult<number> {
  if (typeof v === 'number' && Number.isFinite(v)) return { ok: true, data: v };
  if (v === null) return { ok: false, reason: 'no value' };
  return { ok: false, reason: 'expected a number' };
}

/** Require a table (an array of plain-object rows) for Chart / Table / Facets / Map. */
export function asRows(v: Value): ShapeResult<Row[]> {
  if (!Array.isArray(v)) return { ok: false, reason: 'expected a table of rows' };
  for (const r of v) {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      return { ok: false, reason: 'table rows must be objects' };
    }
  }
  return { ok: true, data: v as Row[] };
}

/** Read a numeric column, coercing null/absent to `null` (never NaN). */
export function numericField(row: Row, field: string): number | null {
  const v = row[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Read any column as a display label. */
export function labelField(row: Row, field: string): string {
  const v = row[field];
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return '';
  return String(v);
}
