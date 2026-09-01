// Test assertions (ARCHITECTURE_PLAN §3.2 testing family). A test's value is a
// structured pass/fail record — never a thrown exception — so the engine can publish it
// on the recalc graph like any other cell value and the review surface can render it.

import type { Value } from './types.ts';

export interface TestResult extends Record<string, Value> {
  pass: boolean;
  message: string;
}

/** Structural equality over plain values (scalars, arrays, plain objects). */
export function deepEqual(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], (b as Record<string, Value>)[k])) return false;
    }
    return true;
  }
  return false;
}

/** Assert deep structural equality. */
export function expectEqual(actual: Value, expected: Value): TestResult {
  const pass = deepEqual(actual, expected);
  return {
    pass,
    message: pass ? 'equal' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    actual,
    expected,
  };
}

export interface CloseTolerance {
  /** Relative tolerance: pass when |actual − expected| ≤ rel · |expected|. */
  rel?: number;
  /** Absolute tolerance: pass when |actual − expected| ≤ abs. */
  abs?: number;
}

/**
 * Assert two numbers are close, within `abs` OR `rel · |expected|` (whichever is
 * given; both permitted). With neither, requires exact equality. A non-numeric or
 * absent operand fails rather than coercing.
 */
export function expectClose(actual: Value, expected: Value, tol: CloseTolerance = {}): TestResult {
  if (typeof actual !== 'number' || typeof expected !== 'number') {
    return {
      pass: false,
      message: `expectClose needs two numbers, got ${JSON.stringify(actual)} and ${JSON.stringify(expected)}`,
      actual,
      expected,
    };
  }
  const diff = Math.abs(actual - expected);
  const bound = Math.max(tol.abs ?? 0, (tol.rel ?? 0) * Math.abs(expected));
  const pass = diff <= bound;
  return {
    pass,
    message: pass ? `within ${bound}` : `|${actual} − ${expected}| = ${diff} > ${bound}`,
    actual,
    expected,
    diff,
  };
}

// ── bound assertions (R3-404) ────────────────────────────────────────────────
//
// The most common shape of a real analytical assertion is a BOUND — a ratio that
// must not exceed a threshold, a reserve that must not fall below one — and the
// stdlib previously had no first-class word for it (`property()` can carry any
// predicate, but reports a bare pass/fail from an anonymous predicate). These four
// flat functions are the capability, reported like their siblings: a TestResult
// naming the actual, the bound, and the direction of the breach.
//
// CHAINED-MATCHER DECISION (recorded, not relitigated): the corpus's prose prints
// `expect(x).toBeLessThan(y)` — that is one corpus's spelling, not a mandate. The
// stdlib's established form is the flat `expectEqual(actual, expected)`; a chained
// `expect(x).toBe…` style is a SEPARATE API question with its own trade-offs
// (fluent wrapper vs flat fn, both shipped = two spellings of one capability). It
// is DECLINED here — these bound functions are the flat form. Do not ship both.

type BoundDir = '<' | '<=' | '>' | '>=';

/** Shared bound check: pass when `actual op bound`; the TestResult carries the
 *  actual, the bound and the direction for a useful failure. A non-numeric or
 *  absent operand fails rather than coercing (matching expectClose). */
function boundCheck(actual: Value, bound: Value, op: BoundDir): TestResult {
  if (typeof actual !== 'number' || typeof bound !== 'number') {
    return {
      pass: false,
      message: `bound assertion needs two numbers, got ${JSON.stringify(actual)} and ${JSON.stringify(bound)}`,
      actual,
      bound,
      direction: op,
    };
  }
  const pass = op === '<' ? actual < bound : op === '<=' ? actual <= bound : op === '>' ? actual > bound : actual >= bound;
  return {
    pass,
    message: pass ? `${actual} ${op} ${bound}` : `expected ${actual} ${op} ${bound} — breached`,
    actual,
    bound,
    direction: op,
  };
}

/** Assert `actual < bound`. */
export function expectLessThan(actual: Value, bound: Value): TestResult {
  return boundCheck(actual, bound, '<');
}

/** Assert `actual <= bound`. */
export function expectAtMost(actual: Value, bound: Value): TestResult {
  return boundCheck(actual, bound, '<=');
}

/** Assert `actual > bound`. */
export function expectGreaterThan(actual: Value, bound: Value): TestResult {
  return boundCheck(actual, bound, '>');
}

/** Assert `actual >= bound`. */
export function expectAtLeast(actual: Value, bound: Value): TestResult {
  return boundCheck(actual, bound, '>=');
}
