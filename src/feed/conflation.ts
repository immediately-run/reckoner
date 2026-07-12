// Conflation — keep-latest coalescing (ARCHITECTURE_PLAN §5.3, RQ-C3 + review-1 F8). "Cadence =
// conflation": writes to a key (a feed's newest frame, or a dragged slider's `params.*` value at
// 60–120 Hz) are coalesced keep-latest, and the evaluator recomputes once per coalesced value —
// never once per write. Feeds and param drags share this **same** backpressure because they feed
// the same single-context evaluator (§5.3 F8); without it a fast drag floods the engine or, under
// naïve cancel-restart, livelocks (F2). This is NOT a debounce — the progress guarantee lives in
// the run-to-completion supersession rule (§4.1); this just collapses the input burst.
//
// Pure + clockless: writes accumulate keep-latest per key; the cadence driver (a timer / rAF, the
// injected effect) calls `flush()` each tick to drain the coalesced batch into `engine.update`.

export class Conflator<V> {
  readonly #pending = new Map<string, V>();
  #coalesced = 0;

  /** Record a write; a prior un-flushed write to the same key is superseded (kept-latest). */
  write(key: string, value: V): void {
    if (this.#pending.has(key)) this.#coalesced++;
    this.#pending.set(key, value);
  }

  hasPending(): boolean {
    return this.#pending.size > 0;
  }

  /** Drain the coalesced batch (latest value per key) and clear. One recompute per flush. */
  flush(): Map<string, V> {
    const batch = new Map(this.#pending);
    this.#pending.clear();
    return batch;
  }

  /** How many writes were superseded before a flush — the backpressure savings (for E-4 metrics). */
  coalesced(): number {
    return this.#coalesced;
  }
}
