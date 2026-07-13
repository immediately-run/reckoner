// The connector's retention buffer (ARCHITECTURE_PLAN §5.3). "The connector owns raw retention
// (`keepLast`/`keepFor` — the Kafka-retention analogue); formulas own analytical windows over
// whatever the buffer holds." This is that buffer: an append-only ring of frames pruned by a
// count (`keepLast`) and/or an age (`keepFor`). It exposes the current **snapshot** (the newest
// data frame — the frozen per-recalculation value) and the retained **rows** a formula's
// `window()` slices by event time. A gap marker (reconnect) is retained like any frame so a
// window spanning it can be reported partial. Pure: the clock is the frame's `receivedAt`,
// never ambient.

import type { Row } from '../stdlib/types.ts';
import { parseDuration } from '../stdlib/window.ts';
import type { Frame } from './frame.ts';
import { frame, gapFrame } from './frame.ts';

export interface RetentionPolicy {
  /** Keep at most this many of the most-recent frames. */
  keepLast?: number;
  /** Keep frames received within this trailing duration (e.g. "1h", "7d"). */
  keepFor?: string;
}

export class RetentionBuffer {
  #frames: Frame[] = [];
  readonly #keepLast?: number;
  readonly #keepForMs?: number;

  constructor(policy: RetentionPolicy = {}) {
    if (policy.keepLast !== undefined) {
      if (!Number.isInteger(policy.keepLast) || policy.keepLast < 1) {
        throw new Error(`keepLast must be a positive integer; got ${JSON.stringify(policy.keepLast)}.`);
      }
      this.#keepLast = policy.keepLast;
    }
    if (policy.keepFor !== undefined) this.#keepForMs = parseDuration(policy.keepFor);
  }

  /** Append received rows as a content-addressed frame and prune by policy. Returns the frame. */
  append(rows: Row[], receivedAt: number): Frame {
    const f = frame(rows, receivedAt);
    this.#frames.push(f);
    this.#evict(receivedAt);
    return f;
  }

  /** Mark a discontinuity (a reconnect / rejoin) so windows spanning it read as partial. */
  markGap(receivedAt: number): Frame {
    const f = gapFrame(receivedAt);
    this.#frames.push(f);
    this.#evict(receivedAt);
    return f;
  }

  /** The current snapshot — the newest data frame (frozen per recalculation, §4.1). */
  latest(): Frame | undefined {
    for (let i = this.#frames.length - 1; i >= 0; i--) {
      if (!this.#frames[i].gap) return this.#frames[i];
    }
    return undefined;
  }

  /** All retained frames, oldest → newest (data + gap markers). */
  frames(): readonly Frame[] {
    return this.#frames;
  }

  /** The retained rows across all data frames, for a formula's event-time `window()`. */
  rows(): Row[] {
    const out: Row[] = [];
    for (const f of this.#frames) if (!f.gap) out.push(...f.rows);
    return out;
  }

  /** Whether a discontinuity falls within the trailing `withinMs` ending at `now` (partial window). */
  hasGapWithin(now: number, withinMs: number): boolean {
    const from = now - withinMs;
    return this.#frames.some((f) => f.gap && f.receivedAt >= from && f.receivedAt <= now);
  }

  size(): number {
    return this.#frames.length;
  }

  #evict(now: number): void {
    if (this.#keepForMs !== undefined) {
      const cutoff = now - this.#keepForMs;
      this.#frames = this.#frames.filter((f) => f.receivedAt >= cutoff);
    }
    if (this.#keepLast !== undefined && this.#frames.length > this.#keepLast) {
      this.#frames = this.#frames.slice(this.#frames.length - this.#keepLast);
    }
  }
}
