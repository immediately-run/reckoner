// Financial functions (R3-376, gap G2 — the Caldera case study's hand-rolled
// `irrBisect`/`npv` module helpers, lifted into the stdlib). The family is deliberately
// minimal (`pmt`/`rate` wait for a case study that needs them — additive-only means
// additions are always possible; the callable *ceiling* is the cost).
//
// Conventions, stated once:
// - `npv(rate, flows)` discounts `flows[0]` at t=0 (undiscounted) — the
//   "investment at t=0" convention, consistent with `irr`. (Excel's NPV() discounts
//   the first flow at t=1; add a leading 0 there if porting that convention.)
// - `irr`/`xirr` use **bracketed bisection**: deterministic, no Newton-convergence
//   surprises, exact to double precision in 200 iterations. This is safe because a
//   single-sign-change flow vector makes NPV(r) monotone (Descartes). Flow vectors
//   without a sign change, or whose NPV does not straddle zero over the bracket,
//   **throw** — a visible cell error, never a confident wrong number.

import type { Row, Value } from './types.ts';

export interface IrrOptions {
  /** Bracket lower bound; default -0.99 (rate > -100%). */
  lo?: number;
  /** Bracket upper bound; default 10 (1000%). */
  hi?: number;
}

/** Net present value: `flows[0]` at t=0 (undiscounted), `flows[t]` discounted at `rate`. */
export function npv(rate: number, flows: Value[]): number {
  if (!Number.isFinite(rate) || rate <= -1) {
    throw new Error(`npv: rate must be finite and > -1 (got ${rate}).`);
  }
  let total = 0;
  for (let t = 0; t < flows.length; t += 1) {
    const cf = flows[t];
    if (typeof cf !== 'number' || !Number.isFinite(cf)) {
      throw new Error(`npv: flow at t=${t} is not a finite number.`);
    }
    total += cf / Math.pow(1 + rate, t);
  }
  return total;
}

/**
 * Internal rate of return of a periodic flow vector (annual periods), by bracketed
 * bisection. Requires at least one negative and one positive flow and an NPV that
 * straddles zero over the bracket — otherwise it throws with a diagnostic.
 */
export function irr(flows: Value[], opts: IrrOptions = {}): number {
  const lo = opts.lo ?? -0.99;
  const hi = opts.hi ?? 10;
  const hasNegative = flows.some((cf) => typeof cf === 'number' && cf < 0);
  const hasPositive = flows.some((cf) => typeof cf === 'number' && cf > 0);
  if (!hasNegative || !hasPositive) {
    throw new Error(
      `irr: flows must contain at least one negative and one positive value (an investment and a return).`,
    );
  }
  const fLo = npv(lo, flows);
  const fHi = npv(hi, flows);
  if (!(fLo > 0) || !(fHi < 0)) {
    throw new Error(
      `irr: no rate in [${lo}, ${hi}] brackets NPV = 0 (NPV(${lo}) = ${fLo}, NPV(${hi}) = ${fHi}); ` +
        `pass { lo, hi } to widen, or check the flows — multiple sign changes can defeat bisection.`,
    );
  }
  let a = lo;
  let b = hi;
  for (let i = 0; i < 200; i += 1) {
    const mid = (a + b) / 2;
    if (npv(mid, flows) > 0) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

/** Days since the epoch for an ISO "YYYY-MM-DD" (or "YYYY-MM") date — pure, no clock. */
function isoEpochDays(date: Value, what: string): number {
  if (typeof date !== 'string') {
    throw new Error(`${what}: expected an ISO date string ("YYYY-MM-DD"); got ${JSON.stringify(date)}.`);
  }
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (m === null) {
    throw new Error(`${what}: "${date}" is not an ISO date ("YYYY-MM-DD" or "YYYY-MM").`);
  }
  const day = m[3] === undefined ? 1 : Number(m[3]);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, day) / 86_400_000);
}

/**
 * Internal rate of return of dated flows: `rows` of `{ amount, <date> }`, the date
 * field named by `by` (default "date", ISO "YYYY-MM-DD"). Day-count basis ACT/365.25;
 * the earliest date is t=0. Same bracketed-bisection contract as `irr`.
 */
export function xirr(rows: Row[], opts: { by?: string } & IrrOptions = {}): number {
  const by = opts.by ?? 'date';
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('xirr: expected a non-empty array of { amount, date } rows.');
  }
  const dated: { amount: number; days: number }[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const amount = r.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new Error(`xirr: row ${i} amount is not a finite number.`);
    }
    dated.push({ amount, days: isoEpochDays(r[by], `xirr row ${i} field "${by}"`) });
  }
  const t0 = Math.min(...dated.map((d) => d.days));
  const lo = opts.lo ?? -0.99;
  const hi = opts.hi ?? 10;
  const npvAt = (rate: number): number => {
    let total = 0;
    for (const d of dated) total += d.amount / Math.pow(1 + rate, (d.days - t0) / 365.25);
    return total;
  };
  const hasNegative = dated.some((d) => d.amount < 0);
  const hasPositive = dated.some((d) => d.amount > 0);
  if (!hasNegative || !hasPositive) {
    throw new Error('xirr: flows must contain at least one negative and one positive value.');
  }
  const fLo = npvAt(lo);
  const fHi = npvAt(hi);
  if (!(fLo > 0) || !(fHi < 0)) {
    throw new Error(
      `xirr: no rate in [${lo}, ${hi}] brackets NPV = 0 (NPV(${lo}) = ${fLo}, NPV(${hi}) = ${fHi}).`,
    );
  }
  let a = lo;
  let b = hi;
  for (let i = 0; i < 200; i += 1) {
    const mid = (a + b) / 2;
    if (npvAt(mid) > 0) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}
