// The feed runtime (ARCHITECTURE_PLAN §5.2/§5.3) — wires connectors → retention buffers →
// conflation → the engine. Each connector frame is appended to that feed's `RetentionBuffer`,
// the newest snapshot is written into a shared `Conflator` keyed `feeds.<name>`, and a scheduled
// **coalesced flush** drains the conflator into one `engine.update` (keep-latest, so a burst
// recomputes once — §5.3 RQ-C3/F8). A discontinuity marks a buffer gap without touching the
// snapshot. The engine and the flush cadence are injected ports: the engine is any async
// `update`, and `scheduleFlush` is rAF in the browser / a microtask in tests.
//
// This increment delivers each feed as its **snapshot** (newest frame's rows) into `feeds.*`.
// Windowed inputs (`{ feed, window }`) resolving over the buffer via `window()` + `params.now`
// are the next increment (they need the engine's input resolver to apply the window).

import type { Row } from '../stdlib/types.ts';
import type { ExternalValue } from '../engine/types.ts';
import type { Tier } from '../engine/tier.ts';
import { RetentionBuffer } from './buffer.ts';
import type { RetentionPolicy } from './buffer.ts';
import { Conflator } from './conflation.ts';
import type { Connector } from './connector.ts';

export interface FeedSpec {
  name: string;
  connector: Connector;
  retention?: RetentionPolicy;
  /** Source tier for this feed's externals — a `poll` feed is `pulled`, a `subscribe` feed `live`. */
  tier?: Tier;
}

/** The minimal engine surface the runtime drives (satisfied by `AsyncEngine`). */
export interface FeedEngine {
  update(delta: Record<string, ExternalValue>): Promise<unknown>;
}

export interface FeedRuntimeDeps {
  engine: FeedEngine;
  /** Schedule one coalesced flush (rAF in the browser, `queueMicrotask`/timer elsewhere). */
  scheduleFlush: (fn: () => void) => void;
  /** Called after each settled flush — the re-render hook. */
  onSettled?: () => void;
}

export class FeedRuntime {
  readonly #specs: FeedSpec[];
  readonly #deps: FeedRuntimeDeps;
  readonly #buffers = new Map<string, RetentionBuffer>();
  readonly #tier = new Map<string, Tier>();
  readonly #conflator = new Conflator<ExternalValue>();
  #stops: (() => void)[] = [];
  #flushScheduled = false;

  constructor(specs: FeedSpec[], deps: FeedRuntimeDeps) {
    this.#specs = specs;
    this.#deps = deps;
    for (const s of specs) {
      this.#buffers.set(s.name, new RetentionBuffer(s.retention));
      this.#tier.set(s.name, s.tier ?? 'live');
    }
  }

  /** Subscribe every connector; frames begin flowing into the engine. */
  start(): void {
    for (const spec of this.#specs) {
      const stop = spec.connector.start({
        frame: (rows, at) => this.#onFrame(spec.name, rows, at),
        gap: (at) => {
          this.#buffers.get(spec.name)?.markGap(at);
        },
      });
      this.#stops.push(stop);
    }
  }

  stop(): void {
    for (const stop of this.#stops) stop();
    this.#stops = [];
  }

  /** The retention buffer for a feed (for windowing / gap inspection). */
  buffer(name: string): RetentionBuffer | undefined {
    return this.#buffers.get(name);
  }

  /** The `feeds.*` externals for the currently-buffered snapshots (for the cold `run`). */
  initialExternals(): Record<string, ExternalValue> {
    const out: Record<string, ExternalValue> = {};
    for (const [name, buf] of this.#buffers) {
      const latest = buf.latest();
      if (latest !== undefined) out[`feeds.${name}`] = { value: latest.rows, tier: this.#tier.get(name)! };
    }
    return out;
  }

  #onFrame(name: string, rows: Row[], receivedAt: number): void {
    const buf = this.#buffers.get(name);
    if (buf === undefined) return;
    buf.append(rows, receivedAt);
    this.#conflator.write(`feeds.${name}`, { value: buf.latest()!.rows, tier: this.#tier.get(name)! });
    this.#scheduleFlush();
  }

  #scheduleFlush(): void {
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    this.#deps.scheduleFlush(() => void this.#flush());
  }

  async #flush(): Promise<void> {
    this.#flushScheduled = false;
    const batch = this.#conflator.flush();
    if (batch.size === 0) return;
    await this.#deps.engine.update(Object.fromEntries(batch));
    this.#deps.onSettled?.();
  }
}
