// The callee's task input, read WITHOUT a static value import of the SDK task
// surface: `@immediately-run/sdk/tasks` registers its `task-input` listener at
// module load, and this repo's platform guard (`src/app/platformGuards.test.ts`,
// DOCUMENT_NAVIGATOR_SPEC §4.1/DN-R5) keeps that surface behind dynamic imports
// forever — the same discipline `useEditFile` applies to `invokeTask`.
//
// The SDK exports no change-subscription for task input other than its own
// `useTaskInput` hook (static-import-only), and the host's delivery is TWO
// complementary re-send mitigations for the one-shot `task-input` wire message
// racing the callee's boot: R3-550's `taskInputGate` (re-send on the first wire
// request after `success` — for callees that make one) and the bounded 1s/4s
// ladder past the compile edges (for callees, like this one, whose boot
// issues no post-`success` wire request at all — mounts read the injected local
// service, this poll is local, boot providers are receive-only). A short bounded
// poll — first read immediately, then 500ms until the input arrives or 30s pass —
// is the lazy-safe equivalent of the subscription: it settles past both
// mechanisms' windows and then stops forever. Off-host (plain `vite dev`,
// vitest) the dynamic import is safe (SDK R3-421) and the input stays null; the
// poll expires silently.

import { useEffect, useState } from 'react';
import type { TaskInput } from '@immediately-run/sdk/tasks';
import { isNoHostTransport } from '../app/sdkTransportError.ts';

const POLL_INTERVAL_MS = 500;
const POLL_MAX_TRIES = 60; // 30s — comfortably past the host's delivery mitigations
// (compile-edge re-sends, the 1s/4s ladder, the post-`success` gate), without
// polling for the frame's life.

export function useTaskInputLazy(): TaskInput | null {
  const [input, setInput] = useState<TaskInput | null>(null);
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const read = (): void => {
      void import('@immediately-run/sdk/tasks')
        .then((m) => {
          if (!alive) return;
          const t = m.getTaskInput();
          if (t) {
            setInput(t);
            window.clearInterval(iv);
          }
        })
        .catch((e: unknown) => {
          if (!alive) return;
          // DEFENSIVE (review round 4): pre-R3-421 SDKs threw the discriminated
          // no-host-transport error at module load off-host; since SDK R3-421
          // (≥0.57.3) the load resolves and `getTaskInput()` returns null, so the
          // benign off-host path is import-resolves/null and this branch is
          // unreachable from the real producer today. It stays because a thrown
          // no-host-transport remains the BENIGN shape should an older SDK or a
          // torn-down frame produce one. Any OTHER rejection (an on-host
          // module-eval failure, a half-torn-down frame) is a real fault in a
          // dispatched task frame — surface it rather than let the frame render
          // the demo document with no signal while the caller's overlay waits on
          // a completeTask that never comes. The discrimination lives in ONE home
          // (sdkTransportError.ts) shared with useEditFile §4.1.
          if (!isNoHostTransport(e)) console.warn('[reckoner] task-input read failed:', e);
        });
    };
    const iv = window.setInterval(() => {
      tries += 1;
      if (tries > POLL_MAX_TRIES) {
        window.clearInterval(iv);
        return;
      }
      read();
    }, POLL_INTERVAL_MS);
    read();
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, []);
  return input;
}
