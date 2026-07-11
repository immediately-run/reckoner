// Aggregators — collapse a group of rows to one value (ARCHITECTURE_PLAN §3.2).
//
// Every aggregator here honors the null semantics: an empty group, or a group with
// no finite numeric values in the target column, returns `null` — never `0`. `0` is a
// correct-looking wrong answer for `mean`/`median` and lets a fitting fixture with no
// empty group pass green while a bug hides (the RQ-D5 mis-inference class).

import type { Aggregator, Row, Value } from './types.ts';
import { numbers, isPresent } from './internal.ts';

/** Σ of the finite numbers in `col`; `null` if there are none. */
export function sum(col: string): Aggregator {
  return (rows: Row[]): Value => {
    const xs = numbers(rows, col);
    if (xs.length === 0) return null;
    let total = 0;
    for (const x of xs) total += x;
    return total;
  };
}

/** Arithmetic mean of the finite numbers in `col`; `null` if there are none. */
export function mean(col: string): Aggregator {
  return (rows: Row[]): Value => {
    const xs = numbers(rows, col);
    if (xs.length === 0) return null;
    let total = 0;
    for (const x of xs) total += x;
    return total / xs.length;
  };
}

/** Median of the finite numbers in `col`; `null` if there are none. */
export function median(col: string): Aggregator {
  return (rows: Row[]): Value => quantileOf(numbers(rows, col), 0.5);
}

/**
 * The q-quantile (0..1) of the finite numbers in `col`, by linear interpolation
 * between order statistics; `null` if there are none.
 */
export function quantile(col: string, q: number): Aggregator {
  return (rows: Row[]): Value => quantileOf(numbers(rows, col), q);
}

/** Minimum finite number in `col`; `null` if there are none. */
export function min(col: string): Aggregator {
  return (rows: Row[]): Value => {
    const xs = numbers(rows, col);
    if (xs.length === 0) return null;
    let m = xs[0];
    for (const x of xs) if (x < m) m = x;
    return m;
  };
}

/** Maximum finite number in `col`; `null` if there are none. */
export function max(col: string): Aggregator {
  return (rows: Row[]): Value => {
    const xs = numbers(rows, col);
    if (xs.length === 0) return null;
    let m = xs[0];
    for (const x of xs) if (x > m) m = x;
    return m;
  };
}

/**
 * A count. `count()` counts rows (SQL `COUNT(*)`); `count(col)` counts the rows
 * whose `col` is present (non-null, non-undefined) — SQL `COUNT(col)`.
 */
export function count(col?: string): Aggregator {
  return (rows: Row[]): Value => {
    if (col === undefined) return rows.length;
    let c = 0;
    for (const r of rows) if (isPresent(r[col])) c += 1;
    return c;
  };
}

/** Take the first row's value for `col` (order-preserving); `null` if the group is empty. */
export function first(col: string): Aggregator {
  return (rows: Row[]): Value => {
    if (rows.length === 0) return null;
    const v = rows[0][col];
    return v === undefined ? null : v;
  };
}

function quantileOf(xs: number[], q: number): Value {
  if (xs.length === 0) return null;
  const sorted = xs.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const clamped = q < 0 ? 0 : q > 1 ? 1 : q;
  const pos = clamped * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}
