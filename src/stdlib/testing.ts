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
