// The live mount set for the dispatched-workbook flow (open-workbook provider). The
// host's repo-load dispatch mounts the corpus BEFORE the viewer runs, but a mount can
// also be announced a beat after boot — so this observes `onMountsChange`. Honest
// trigger story (review round 4, correcting a false latch claim): there IS no latch —
// every `onMountsChange` hands a fresh array and the consumer's effect rebuilds on
// identity (a rebuild is a FULL cold session rebuild — it discards in-session param
// writes and spins a fresh engine worker; observed rarely enough in practice that no
// one has measured it, which is not the same as cheap), and the resolution REFUSES
// two content mounts rather than latching one (dispatch.ts).

import { useEffect, useState } from 'react';
// The per-module subpath, deliberately: the SDK root pulls in `tasks.ts`, whose
// load-time listener is the side effect the §4.1/DN-R5 discipline keeps behind
// dynamic imports. (Accuracy, review round 5: since SDK R3-421 / ≥0.57.3 the
// listener's registration is try/catch-wrapped, so the load no longer THROWS
// off-host — the discipline stands on the side-effect, not on the throw.)
import { getMounts, onMountsChange } from '@immediately-run/sdk/mounts';
import type { SandboxMount } from '@immediately-run/sdk/mounts';

/** A snapshot of the mount set that re-renders on change; empty under vite dev. */
export function useMounts(): readonly SandboxMount[] {
  const [mounts, setMounts] = useState<readonly SandboxMount[]>(() => {
    try {
      return [...getMounts()];
    } catch {
      return []; // no host runtime (vite dev) — the seed document flow
    }
  });

  useEffect(() => {
    try {
      return onMountsChange((next) => setMounts([...next]));
    } catch {
      return undefined; // no host runtime — nothing to observe
    }
  }, []);

  return mounts;
}
