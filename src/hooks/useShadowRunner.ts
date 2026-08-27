// The shadow-run hook (WHATIF_SHADOW_EVALUATION_SPEC §6) — the one effectful owner both
// surfaces (the what-if panel and the scratch pad) drive: one transport per surface
// instance, created lazily and reused across runs (each run re-`build`s, which replaces
// worker state), disposed on unmount (G-WIF-7). Explicit runs only: a run is refused
// while one is in flight — the spec's explicit-Run decision, not supersession.

import { useEffect, useRef, useState } from 'react';
import type { WorkerTransport } from '../engine/workerTransport.ts';
import type { ShadowPatch } from '../engine/shadow.ts';
import type { SubjectResult } from '../engine/worker/protocol.ts';
import { makeTransport } from '../app/reportSession.ts';
import type { ReportSession } from '../app/reportSession.ts';
import { runShadow } from '../app/whatif.ts';
import type { ShadowOutcome } from '../app/whatif.ts';

export function useShadowRunner(session: ReportSession): {
  outcome: ShadowOutcome | null;
  running: boolean;
  run: (patch: ShadowPatch, baseVerdicts: ReadonlyMap<string, SubjectResult> | null) => void;
  reset: () => void;
} {
  const [outcome, setOutcome] = useState<ShadowOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const transportRef = useRef<WorkerTransport | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      transportRef.current?.dispose();
      transportRef.current = null;
    };
  }, []);

  const run = (patch: ShadowPatch, baseVerdicts: ReadonlyMap<string, SubjectResult> | null): void => {
    if (running) return;
    setRunning(true);
    void (async () => {
      try {
        transportRef.current ??= await makeTransport();
        const out = await runShadow(session, patch, transportRef.current, baseVerdicts);
        if (aliveRef.current) setOutcome(out);
      } catch (e) {
        if (aliveRef.current) {
          setOutcome({
            ok: false,
            refusal: { code: 'build-error', message: e instanceof Error ? e.message : String(e) },
          });
        }
      } finally {
        if (aliveRef.current) setRunning(false);
      }
    })();
  };

  return { outcome, running, run, reset: () => setOutcome(null) };
}
