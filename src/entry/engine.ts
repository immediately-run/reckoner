// The real Web Worker entry (ARCHITECTURE_PLAN §4): `lockdown()` the worker realm, then serve
// `build`/`eval` over `postMessage` with the framework-free worker body. This is the one piece
// that can only run inside a real dedicated worker; all of its logic lives in the tested
// `createEngineWorker`. The host spawns it with
//   new Worker(new URL('./entry/engine.ts', import.meta.url), { type: 'module' })
// (a standard ESM worker — not a bundler macro), wrapped by `workerTransport`.

import 'ses';
import { createEngineWorker } from '../engine/worker/engineWorker.ts';
import type { WorkerRequest, WorkerResponse } from '../engine/worker/protocol.ts';

interface WorkerScope {
  onmessage: ((e: { data: WorkerRequest }) => void) | null;
  postMessage(msg: WorkerResponse): void;
  lockdown?: (opts?: Record<string, unknown>) => void;
}
const scope = globalThis as unknown as WorkerScope;

// Freeze intrinsics so formulas run in a starved realm. Confinement holds with or without
// lockdown (a fresh Compartment holds only its endowments), but production locks down; the
// availability-critical half is the host's watchdog, which terminates a wedged worker.
scope.lockdown?.({ errorTaming: 'unsafe' });

const worker = createEngineWorker();

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'build') {
    try {
      scope.postMessage({ type: 'built', descriptor: worker.build(msg.sources) });
    } catch (err) {
      scope.postMessage({ type: 'build-error', message: (err as Error).message });
    }
    return;
  }
  // A formula may be async (§4.1) — await it before posting the result.
  Promise.resolve()
    .then(() => worker.eval(msg.id, msg.inputs))
    .then((value) => scope.postMessage({ type: 'result', token: msg.token, id: msg.id, value }))
    .catch((err) => scope.postMessage({ type: 'eval-error', token: msg.token, id: msg.id, message: (err as Error).message }));
};
