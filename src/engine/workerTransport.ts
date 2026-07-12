// The host's channel to a restartable, terminable worker (ARCHITECTURE_PLAN §4.1). The async
// engine drives evaluation through this port; keeping it an injected interface is what lets the
// engine be tested with an in-process worker (no real threads) and lets `restart()` model the
// terminate-and-rebuild the hard-runaway watchdog relies on.

import { createEngineWorker } from './worker/engineWorker.ts';
import type { WorkerRequest, WorkerResponse } from './worker/protocol.ts';

export interface WorkerTransport {
  post(msg: WorkerRequest): void;
  onMessage(handler: (msg: WorkerResponse) => void): void;
  /** Terminate the current worker (abandoning any in-flight eval) and start a fresh one. */
  restart(): void;
}

/**
 * Runs the worker body in-process. Used in tests and as a main-thread fallback where a real
 * Worker/SES-lockdown context is unavailable. Responses are delivered on a microtask so callers
 * see async semantics. NOTE: it cannot interrupt a synchronous divergence (same thread) — the
 * hard-runaway watchdog path is exercised in tests with a transport double that simply withholds
 * a response, which is what a wedged worker looks like from the host's side.
 */
export function inMemoryTransport(): WorkerTransport {
  let worker = createEngineWorker();
  let handler: (msg: WorkerResponse) => void = () => {};
  const deliver = (msg: WorkerResponse): void => {
    queueMicrotask(() => handler(msg));
  };
  return {
    post(msg) {
      if (msg.type === 'build') {
        try {
          deliver({ type: 'built', descriptor: worker.build(msg.sources) });
        } catch (e) {
          deliver({ type: 'build-error', message: (e as Error).message });
        }
        return;
      }
      // A formula may be async — await it before delivering (§4.1).
      Promise.resolve()
        .then(() => worker.eval(msg.id, msg.inputs))
        .then((value) => deliver({ type: 'result', token: msg.token, id: msg.id, value }))
        .catch((e) => deliver({ type: 'eval-error', token: msg.token, id: msg.id, message: (e as Error).message }));
    },
    onMessage(h) {
      handler = h;
    },
    restart() {
      worker = createEngineWorker();
    },
  };
}

/**
 * A real Web Worker transport. `createWorker` is injected so the (bundler-/standard-specific)
 * `new Worker(new URL('./entry/engine.ts', import.meta.url), { type: 'module' })` call lives at
 * the call site, not in this library. `restart()` is the watchdog's kill switch: `terminate()`
 * drops a wedged worker (and any in-flight eval) and a fresh one is spawned.
 */
export function workerTransport(createWorker: () => Worker): WorkerTransport {
  let worker = createWorker();
  let handler: (msg: WorkerResponse) => void = () => {};
  const wire = (): void => {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => handler(e.data);
  };
  wire();
  return {
    post(msg) {
      worker.postMessage(msg);
    },
    onMessage(h) {
      handler = h;
    },
    restart() {
      worker.terminate();
      worker = createWorker();
      wire();
    },
  };
}
