// The `open-workbook` provider — Reckoner as a dispatched viewer (the R3-169 pattern,
// after Grove's `open-wiki`). A repo whose `immediately.run.json` marker declares
// `opensWith: { task: "open-workbook" }` is dispatched by the host: the corpus is
// mounted for us (the mount IS the grant — everything here is downstream of authority
// we never asked for and cannot widen) and this app renders it instead of the bundled
// demo document.
//
// v1 resolves the REPO-LOAD dispatch shape (the URL named a workbook repo; the mount
// carries `type: 'content'`, per R3-172 — same discovery rule as Grove's). The
// task-invocation shape (another app `invokeTask`-ing us with a `dir` delegation) is
// deliberately not handled yet; the marker names the CONTRACT, never this app, so a
// rebind to a fork keeps working either way.

import type { SandboxMount } from '@immediately-run/sdk';

/** The contract this app provides (package.json `provides` must match). */
export const OPEN_WORKBOOK_TASK = 'open-workbook';

/** The mount `type` the host stamps on a corpus it dispatched by repo load (R3-172). */
export const CONTENT_MOUNT_TYPE = 'content';

export type WorkbookResolution =
  | { ok: true; root: string; via: 'repo-load'; mount: SandboxMount }
  | { ok: false; reason: 'not-dispatched' | 'ambiguous' };

/**
 * Where the dispatched workbook lives, from the mount set — pure, so the whole
 * resolution is testable without a host. A repo-load dispatch is the one mount marked
 * `type: 'content'` (keyed on the mark, NOT on "the only foreign mount" — that guess
 * reads wrong the moment the viewer also holds a space or a worktree). Two marked
 * mounts is a host bug we refuse rather than paper over.
 *
 * The ok variant carries the MOUNT itself (not just its path) since R3-447: Part B's
 * edit affordance derives writability from `mode` (the positive `rw` check R-EFE-1
 * prescribes — never "absent ⇒ writable") and addresses its `capFile` delegation with
 * the descriptor's `id`, which the live host contract established as the universal
 * `scheme:locator` form (`content:owner/repo`) — `SandboxMount.id` with the `path`
 * fallback the SDK documents.
 */
export function resolveWorkbookMount(mounts: readonly SandboxMount[]): WorkbookResolution {
  const marked = mounts.filter((m) => m.type === CONTENT_MOUNT_TYPE);
  if (marked.length === 1) return { ok: true, root: marked[0].path, via: 'repo-load', mount: marked[0] };
  if (marked.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: false, reason: 'not-dispatched' };
}
