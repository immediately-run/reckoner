// The live mount set for the dispatched-workbook flow (open-workbook provider). The
// host's repo-load dispatch mounts the corpus BEFORE the viewer runs, but a mount can
// also be announced a beat after boot — so this observes `onMountsChange` and the
// session rebuilds when the workbook resolution actually changes (never mid-document:
// the resolution latches on the first content mount, matching Grove's boot rule).

import { useEffect, useState } from 'react';
// The per-module subpath, deliberately: the SDK root pulls in `tasks.ts`, which
// registers a host listener at module load and throws in plain vite dev (no host
// transport). `mounts` is documented side-effect-clean for exactly this reason.
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
