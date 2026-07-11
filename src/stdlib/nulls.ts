// Null / empty semantics as first-class stdlib citizens (ARCHITECTURE_PLAN §3.2,
// DSL-6). These are a correctness gate, not conveniences: an undefined empty-group
// return, or a silent `NaN`/`Infinity`, lets a fitting fixture pass green while a bug
// hides. `null` is the one empty marker; `undefined` is treated as absent on input but
// never produced.

import type { Value } from './types.ts';
import { sanitize, isPresent } from './internal.ts';

/** First present (non-null, non-undefined) argument, else `null`. */
export function coalesce(...values: (Value | undefined)[]): Value {
  for (const v of values) if (isPresent(v)) return v;
  return null;
}

/** `value` if present, otherwise `fallback`. The two-argument form of {@link coalesce}. */
export function orElse(value: Value | undefined, fallback: Value): Value {
  return isPresent(value) ? value : fallback;
}

/**
 * Division that yields `null` rather than `Infinity`/`NaN` when the denominator is
 * zero or either operand is absent/non-finite. This is the divide-by-zero primitive
 * every ratio (NRR, GRR, churn %, concentration %) is expected to route through.
 */
export function safeDiv(a: Value | undefined, b: Value | undefined): Value {
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  if (b === 0) return null;
  return sanitize(a / b);
}
