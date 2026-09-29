// The `open-workbook` provider — Reckoner as a dispatched viewer (the R3-169 pattern,
// after Grove's `open-wiki`). A repo whose `immediately.run.json` marker declares
// `opensWith: { task: "open-workbook" }` is dispatched by the host: the corpus is
// mounted for us (the mount IS the grant — everything here is downstream of authority
// we never asked for and cannot widen) and this app renders it instead of the bundled
// demo document.
//
// Two dispatch shapes resolve here (R3-754):
//
//   • v1, the REPO-LOAD shape — the URL named a workbook repo; the mount carries
//     `type: 'content'` (R3-172 — same discovery rule as Grove's).
//   • v2, the TASK-INVOCATION shape — another app (file-explorer's folder
//     affordance, R3-267) `invokeTask`-ed this contract with a `dir` capability.
//     Probed live on the venue before coding (R3-754's P1/P2 discipline — the
//     second host contract, not a guess): `getTaskInput()` returns
//     `{ task: 'open-workbook', params: { dir: '/task/<slot>/dir' } }` — the host
//     REWRITES the caller's `dir` param to the minted chroot path — and the
//     delegation arrives as the one mount
//     `{ path: '/task/<slot>/dir', type: 'task-delegation', id: <same>, mode }`,
//     `mode` being `min(caller grant, cap, contract)` (an `ro` caller folder
//     yields an `ro` delegation; the edit door's positive-`rw` gate follows).
//
// The marker names the CONTRACT, never this app, so a rebind to a fork keeps
// working either way.

import type { SandboxMount } from '@immediately-run/sdk';
import type { TaskInput } from '@immediately-run/sdk/tasks';

/** The contract this app provides (package.json `provides` must match). */
export const OPEN_WORKBOOK_TASK = 'open-workbook';

/** The mount `type` the host stamps on a corpus it dispatched by repo load (R3-172). */
export const CONTENT_MOUNT_TYPE = 'content';

/** The mount `type` the host stamps on a task-delegated chroot (R3-754, probed live). */
export const TASK_DELEGATION_MOUNT_TYPE = 'task-delegation';

export type WorkbookResolution =
  | { ok: true; root: string; via: 'repo-load' | 'task-invocation'; mount: SandboxMount }
  | { ok: false; reason: 'not-dispatched' | 'ambiguous' };

/**
 * Where the dispatched workbook lives, from the mount set (+ the task input, for
 * the task-invocation shape) — pure, so the whole resolution is testable without a
 * host. A repo-load dispatch is the one mount marked `type: 'content'` (keyed on
 * the mark, NOT on "the only foreign mount" — that guess reads wrong the moment
 * the viewer also holds a space or a worktree). A task-invocation dispatch is the
 * one `task-delegation` mount at the input's rewritten `dir` path — keyed on the
 * task input, the task shape's mark, with the same no-guessing discipline. Two
 * marked mounts (either shape), or one of EACH shape claiming the same frame, is
 * a host bug we refuse rather than paper over.
 *
 * The ok variant carries the MOUNT itself (not just its path) since R3-447: Part B's
 * edit affordance derives writability from `mode` (the positive `rw` check R-EFE-1
 * prescribes — never "absent ⇒ writable") and addresses its `capFile` delegation with
 * the descriptor's `id`, which the live host contract established as the universal
 * `scheme:locator` form (`content:owner/repo`) for repo-load and as the chroot path
 * (`/task/<slot>/dir`) for the task shape. The host's grant lookup matches that
 * id exactly; there is no fallback, so the door fails closed on a mount without one.
 */
export function resolveWorkbookMount(
  mounts: readonly SandboxMount[],
  taskInput?: TaskInput | null,
): WorkbookResolution {
  const marked = mounts.filter((m) => m.type === CONTENT_MOUNT_TYPE);

  // The task-invocation shape: keyed on the input (this frame was invoked AS this
  // contract), matched against the delegation the host minted for the `dir` param.
  // An input for any other task, or one whose `dir` finds no matching delegation,
  // resolves nothing here — the repo-load mark below is then the only shape left.
  let taskMatch: readonly SandboxMount[] = [];
  if (taskInput && taskInput.task === OPEN_WORKBOOK_TASK) {
    const dir = taskInput.params?.dir;
    if (typeof dir === 'string') {
      taskMatch = mounts.filter(
        (m) => m.type === TASK_DELEGATION_MOUNT_TYPE && (m.path === dir || m.id === dir),
      );
      if (taskMatch.length > 1) return { ok: false, reason: 'ambiguous' };
    }
  }

  if (taskMatch.length === 1) {
    // Both shapes claiming one frame cannot both be the document — refuse.
    if (marked.length > 0) return { ok: false, reason: 'ambiguous' };
    return { ok: true, root: taskMatch[0].path, via: 'task-invocation', mount: taskMatch[0] };
  }
  if (marked.length === 1) return { ok: true, root: marked[0].path, via: 'repo-load', mount: marked[0] };
  if (marked.length > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: false, reason: 'not-dispatched' };
}
