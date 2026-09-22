// Part B's edit door (DOCUMENT_NAVIGATOR_SPEC §4) — the stateful half of the
// delegation. The pure halves live beside it: `app/documentPaths.ts` gates the path
// before `capFile` ever sees it (§4.3/DN-R7), and `app/dispatch.ts` resolves the mount
// the door addresses. This hook owns:
//
//   • WRITABILITY (§4, after R3-447's host spike): derived from the live mount's
//     `mode` by the POSITIVE `rw` check R-EFE-1 prescribes — never "absent ⇒
//     writable" (DN-R2). Anything else — `ro`, or no dispatched mount at all —
//     means the affordance is ABSENT (editor-first §7 rule 3: absent, never
//     disabled; a greyed control still claims the action exists here).
//   • THE CALL (§4.1/DN-R5): `@immediately-run/sdk/tasks` registers a host listener
//     at module load, so it is imported dynamically INSIDE the handler; a
//     host-less environment (plain `vite dev`) is a silent no-op, the same shape
//     `reportSession.ts` uses for the worker URL. The platform guard
//     (`platformGuards.test.ts`) keeps the import lazy forever.
//   • BOTH REFUSAL CHANNELS (§4.2/DN-R1): `invokeTask` throws with a machine
//     `.code` AND returns the contract result unexamined — the edit-file contract
//     answers `{ saved: boolean }`, and `saved: false` is the result-carried
//     refusal. `cancelled` is silent; `forbidden` and the result-carried refusal
//     draw one plain message and LATCH the door off for that mount state, so a
//     stale grant cannot produce repeated dead clicks; anything else names its code.
//   • THE STALENESS SIGNAL (§4.4/DN-R11): a successful edit flips `edited`, which
//     App answers with the document-changed notice — the session reads the
//     document once, so the rendered report is stale the moment a save lands.

import { useCallback, useMemo, useRef, useState } from 'react';
import type { SandboxMount } from '@immediately-run/sdk';
import { validDocumentRelPath } from '../app/documentPaths.ts';

/** The plain refusal copy — one line, no code, no `EROFS` prose, no stack (§4.2). */
const REFUSED_MESSAGE = 'This document can’t be edited here.';

/** A transient, human-readable outcome line; `null` = nothing to say (silent). */
export type EditFileNotice = string | null;

export interface EditFilePort {
  /** The per-row door test: the mount is dispatched and `rw`, the door is not
   *  latched off, and THIS path passes the §4.3 gate. The affordance renders
   *  only where this is true — absent otherwise, never disabled. */
  canEditPath: (relPath: string) => boolean;
  /** Open the platform editor on one document file (§4's delegation). */
  onEdit: (relPath: string) => void;
  /** The last outcome's one-line notice (`null` = silent — §4.2's cancelled/no-op). */
  notice: EditFileNotice;
  /** True once a save has landed and the rendered report is stale (§4.4). */
  edited: boolean;
  /** Clear the staleness signal (the caller does this when it reloads). */
  clearStale: () => void;
}

export function useEditFile(mount: SandboxMount | null): EditFilePort {
  // The latch: the mount-state identity that last drew `forbidden`/a result-carried
  // refusal. It is active ONLY while that identity IS the current mount state — a
  // re-grant, a role change or a re-dispatch re-arms the door BY DERIVATION (the
  // stored string no longer matches), which is exactly "stop offering for that
  // mount state" without an effect resetting anything.
  const [latchedFor, setLatchedFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditFileNotice>(null);
  const [edited, setEdited] = useState(false);
  const busy = useRef(false);

  const mountState = mount !== null ? `${mount.id ?? mount.path}|${mount.mode ?? ''}` : null;
  const latchActive = latchedFor !== null && latchedFor === mountState;
  const writable = mount !== null && mount.mode === 'rw' && !latchActive;

  const canEditPath = useCallback(
    (relPath: string) => writable && validDocumentRelPath(relPath),
    [writable],
  );

  const onEdit = useCallback(
    (relPath: string) => {
      if (mount === null || !writable || busy.current) return;
      if (!validDocumentRelPath(relPath)) return; // §4.3 — never construct the delegation
      busy.current = true;
      setNotice(null);
      void (async () => {
        try {
          // §4.1/DN-R5 — the lazy import, inside the handler, never at module load.
          const { invokeTask, capFile } = await import('@immediately-run/sdk/tasks');
          // The host contract (R3-447, established live): the mount's `id` IS the
          // universal `scheme:locator` form — pass the descriptor's id, with the
          // `path` fallback the SDK documents for mounts that carry none.
          const result = await invokeTask<{ saved?: boolean }>('edit-file', {
            file: capFile({ mountId: mount.id ?? mount.path, relPath }, { mode: 'rw' }),
          });
          if (result?.saved === true) {
            setEdited(true); // §4.4 — the rendered report is now stale
            setNotice(null);
          } else {
            // The result-carried refusal (§4.2/DN-R1): a call that ignored the
            // return value would have handled nothing.
            setNotice(REFUSED_MESSAGE);
            setLatchedFor(`${mount.id ?? mount.path}|${mount.mode ?? ''}`);
          }
        } catch (e) {
          const err = e as { code?: string; message?: string };
          if (err?.code === 'cancelled') {
            setNotice(null); // the user dismissed the editor; not an error
          } else if (err?.code === 'forbidden') {
            setNotice(REFUSED_MESSAGE);
            setLatchedFor(`${mount.id ?? mount.path}|${mount.mode ?? ''}`);
          } else if (typeof err?.message === 'string' && /no host transport/i.test(err.message)) {
            setNotice(null); // host-less (plain vite dev) — a no-op (§4.1)
          } else {
            setNotice(`Couldn’t open the editor${err?.code !== undefined ? ` (${err.code})` : ''}.`);
          }
        } finally {
          busy.current = false;
        }
      })();
    },
    [mount, writable],
  );

  const clearStale = useCallback(() => setEdited(false), []);

  return useMemo(
    () => ({ canEditPath, onEdit, notice, edited, clearStale }),
    [canEditPath, onEdit, notice, edited, clearStale],
  );
}
