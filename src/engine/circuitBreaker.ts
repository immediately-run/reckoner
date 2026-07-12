// The evaluation circuit breaker (ARCHITECTURE_PLAN §4.1, review-2 C-2/C-3). SES confines a
// formula's authority but NOT its availability (RQ-A4 residual): a synchronous divergence has
// to be `terminate()`d, and a soft budget-exceed is timing-dependent. Two distinct failure
// classes, handled differently — and deliberately NOT an `(cell, input-hash)` memo, which
// fails under a live feed (every tick is a fresh hash → the memo never hits and a diverging
// cell tears the context down forever).
//
//   - **Hard runaway** (CPU-bound, had to terminate): a per-cell breaker — after `hardLimit`
//     terminations attributable to a cell within `windowMs` (*regardless of input*), the cell
//     is **quarantined** (the scheduler stops demanding it; dependents get the lattice error)
//     until an author re-arms it. This is what makes progress hold when the diverging input
//     keeps changing — the property an input-keyed memo lacks.
//   - **Soft budget-exceed** (machine load / GC / co-scheduling — NOT a pure function of
//     inputs): **confirm before sticking** (only a reproduced timeout counts), and even then
//     **decay with a TTL**, never permanent — a wall-clock outcome must never be memoized as a
//     pure function of inputs (that would poison a fixture-driven test cell after one load spike).
//
// Pure + deterministic: the clock is passed in (`now`), never read ambiently — the same
// discipline the formula layer follows, so the breaker is trivially testable.

export interface BreakerConfig {
  /** Hard terminations attributable to one cell within `windowMs` before it quarantines. */
  hardLimit: number;
  windowMs: number;
  /** How long a *confirmed* soft budget-exceed suppresses a cell (decays; never permanent). */
  softSuppressMs: number;
}

export const DEFAULT_BREAKER: BreakerConfig = { hardLimit: 3, windowMs: 60_000, softSuppressMs: 10_000 };

interface CellRecord {
  /** Hard-termination timestamps within the rolling window. */
  hardHits: number[];
  /** Sticky hard quarantine — cleared only by an author re-arm. */
  quarantined: boolean;
  /** Soft suppression expiry (0 = none); decays with the clock. */
  softUntil: number;
}

export class CircuitBreaker {
  readonly #cfg: BreakerConfig;
  readonly #cells = new Map<string, CellRecord>();

  constructor(cfg: BreakerConfig = DEFAULT_BREAKER) {
    this.#cfg = cfg;
  }

  #record(cell: string): CellRecord {
    let r = this.#cells.get(cell);
    if (r === undefined) {
      r = { hardHits: [], quarantined: false, softUntil: 0 };
      this.#cells.set(cell, r);
    }
    return r;
  }

  /**
   * Record a hard (had-to-terminate) failure attributable to `cell`. Returns whether the cell
   * is now quarantined.
   */
  hardTermination(cell: string, now: number): boolean {
    const r = this.#record(cell);
    r.hardHits = r.hardHits.filter((t) => now - t < this.#cfg.windowMs);
    r.hardHits.push(now);
    if (r.hardHits.length >= this.#cfg.hardLimit) r.quarantined = true;
    return r.quarantined;
  }

  /**
   * Record a soft budget-exceed. Only a `confirmed` (reproduced) timeout suppresses the cell,
   * and only for `softSuppressMs` (it decays) — never a permanent, input-keyed stick.
   */
  softTimeout(cell: string, now: number, confirmed: boolean): void {
    if (!confirmed) return;
    this.#record(cell).softUntil = now + this.#cfg.softSuppressMs;
  }

  /** Whether the scheduler should refuse to demand `cell` at `now` (hard quarantine or live soft). */
  isBlocked(cell: string, now: number): boolean {
    const r = this.#cells.get(cell);
    return r !== undefined && (r.quarantined || now < r.softUntil);
  }

  /** Author re-arm — clear a hard quarantine and any soft suppression. */
  rearm(cell: string): void {
    const r = this.#cells.get(cell);
    if (r !== undefined) {
      r.quarantined = false;
      r.hardHits = [];
      r.softUntil = 0;
    }
  }

  /** The currently hard-quarantined cells. */
  quarantined(): string[] {
    return [...this.#cells].filter(([, r]) => r.quarantined).map(([cell]) => cell);
  }
}
