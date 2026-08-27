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

export interface SolveOptions {
  /**
   * Monotonicity probe count (default 32): the bracket is sampled at this many points
   * and must change sign exactly once across consecutive samples — a cheap visible
   * rejection of multi-root brackets. Set to 1 to disable (document why).
   */
  probes?: number;
}

/**
 * 1-D monotone goal seek: the `x` in `[lo, hi]` where `fn(x) = target`, by bisection
 * (deterministic; exact to double precision in 200 iterations — the same contract as
 * `irr`, which is `solve` over NPV). The bracket must straddle the target and probe
 * monotone — otherwise it **throws** with the endpoints named, never a confident wrong
 * root. Interactive/multi-variate Solver is deliberately out of scope.
 */
export function solve(
  fn: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  opts: SolveOptions = {},
): number {
  if (!(lo < hi)) {
    throw new Error(`solve: bracket requires lo < hi (got ${lo}, ${hi}).`);
  }
  const g = (x: number): number => fn(x) - target;
  const gLo = g(lo);
  const gHi = g(hi);
  if (!Number.isFinite(gLo) || !Number.isFinite(gHi)) {
    throw new Error(`solve: fn must be finite at both bracket ends (fn(${lo}) = ${gLo + target}, fn(${hi}) = ${gHi + target}).`);
  }
  if (gLo === 0) return lo;
  if (gHi === 0) return hi;
  if (gLo * gHi > 0) {
    throw new Error(
      `solve: [${lo}, ${hi}] does not bracket target ${target} (fn(${lo}) − target = ${gLo}, fn(${hi}) − target = ${gHi}); widen the bracket or check the model.`,
    );
  }
  const probes = opts.probes ?? 32;
  if (probes > 1) {
    let crossings = 0;
    let prev = gLo;
    for (let i = 1; i < probes; i += 1) {
      const x = lo + ((hi - lo) * i) / (probes - 1);
      const gi = g(x);
      if (!Number.isFinite(gi)) {
        throw new Error(`solve: fn must be finite across the bracket (fn(${x}) is not).`);
      }
      if (gi === 0) continue; // a probe landing exactly on the root is not a crossing
      if (prev !== 0 && prev * gi < 0) crossings += 1;
      prev = gi;
    }
    if (crossings > 1) {
      throw new Error(
        `solve: fn changes sign ${crossings}× across [${lo}, ${hi}] — not monotone; bisection would return an arbitrary root. Split the bracket or model the branches.`,
      );
    }
  }
  let a = lo;
  let b = hi;
  const signLo = Math.sign(gLo);
  for (let i = 0; i < 200; i += 1) {
    const mid = (a + b) / 2;
    const gm = g(mid);
    if (gm === 0) return mid;
    if (Math.sign(gm) === signLo) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}
