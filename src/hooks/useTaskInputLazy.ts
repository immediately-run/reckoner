// The callee's task input, read WITHOUT a static value import of the SDK task
// surface: `@immediately-run/sdk/tasks` registers its `task-input` listener at
// module load, and this repo's platform guard (`src/app/platformGuards.test.ts`,
// DOCUMENT_NAVIGATOR_SPEC §4.1/DN-R5) keeps that surface behind dynamic imports
// forever — the same discipline `useEditFile` applies to `invokeTask`.
//
// The SDK exports no change-subscription for task input other than its own
// `useTaskInput` hook (static-import-only), and the host's delivery is a re-send
// gate (R3-550's `taskInputGate`, which this PR's site-main leg rides after the
// 2026-09-29 rebase — its own 1s/4s ladder was dropped in favour of the later
// reviewed fix for the same race): the one-shot `task-input` wire message races
// the callee's boot, so the host re-sends on the compile edges and once more on
// the first wire request after `success`. A short bounded poll — first read
// immediately, then 500ms until the input arrives or 30s pass — is the lazy-safe
// equivalent of the subscription: it settles past the gate's window and then
// stops forever. Off-host (plain `vite dev`, vitest) the dynamic import is safe
// (SDK R3-421) and the input stays null; the poll expires silently.

import { useEffect, useState } from 'react';
import type { TaskInput } from '@immediately-run/sdk/tasks';
import { isNoHostTransport } from '../app/sdkTransportError.ts';

const POLL_INTERVAL_MS = 500;
const POLL_MAX_TRIES = 60; // 30s — comfortably past the host's delivery gate (compile-edge
// re-sends plus the first post-`success` request), without polling for the frame's life.

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
          // Off-host (plain `vite dev`, vitest) the module load itself throws the
          // SDK's discriminated no-host-transport error — the benign case: the
          // input stays null and the poll expires silently. Any OTHER rejection
          // (an on-host module-eval failure, a half-torn-down frame) is a real
          // fault in a dispatched task frame — surface it rather than let the
          // frame render the demo document with no signal while the caller's
          // overlay waits on a completeTask that never comes. The discrimination
          // lives in ONE home (sdkTransportError.ts) shared with useEditFile §4.1.
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
