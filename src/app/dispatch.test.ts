// The open-workbook dispatched flow (R3-169 pattern, after Grove's open-wiki):
// resolution from the mount set, and the full session over a real mounted document
// (the DCF notebook's shape — the same `loadDocument` pipeline as the seed, but read
// from the filesystem port instead of embedded constants).

import { describe, it, expect } from 'vitest';
import { resolveWorkbookMount } from './dispatch.ts';
import type { SandboxMount } from '@immediately-run/sdk';

const mount = (over: Partial<SandboxMount>): SandboxMount =>
  ({ id: 'm', path: '/x', type: 'app', ...over }) as SandboxMount;

describe('resolveWorkbookMount', () => {
  it('the repo-load mark: the one mount typed "content" is the workbook root, and the ok variant carries the mount itself (Part B, R3-447)', () => {
    const wb = mount({ id: 'content:o/r', path: '/task/7/dir', type: 'content', mode: 'ro' });
    const mounts = [mount({ id: 'app', path: '/app', type: 'app' }), wb];
    expect(resolveWorkbookMount(mounts)).toEqual({ ok: true, root: '/task/7/dir', via: 'repo-load', mount: wb });
  });

  it('the carried mount is what the edit door addresses: id and mode come from the live descriptor (G-DN-B1)', () => {
    const r = resolveWorkbookMount([
      mount({ id: 'content:owner/repo', path: '/mnt/h', type: 'content', mode: 'rw' }),
    ]);
    if (!r.ok) throw new Error('expected ok');
    expect(r.mount.id).toBe('content:owner/repo');
    expect(r.mount.mode).toBe('rw');
  });

  it('foreign mounts WITHOUT the mark are not guessed at (a space, a worktree)', () => {
    const mounts = [
      mount({ id: 'app', path: '/app', type: 'app' }),
      mount({ id: 'space', path: '/space/abc', type: 'space' }),
      mount({ id: 'wt', path: '/wt/1', type: 'worktree' }),
    ];
    expect(resolveWorkbookMount(mounts)).toEqual({ ok: false, reason: 'not-dispatched' });
  });

  it('no mounts → the seed document flow', () => {
    expect(resolveWorkbookMount([])).toEqual({ ok: false, reason: 'not-dispatched' });
  });

  it('two marked mounts is a host bug we refuse, not paper over', () => {
    const mounts = [
      mount({ id: 'a', path: '/a', type: 'content' }),
      mount({ id: 'b', path: '/b', type: 'content' }),
    ];
    expect(resolveWorkbookMount(mounts)).toEqual({ ok: false, reason: 'ambiguous' });
  });
});

// The task-invocation shape (R3-754), against the PROBED live contract: the input
// `{ task: 'open-workbook', params: { dir: '/task/task-1/dir' } }` (the host
// rewrites `dir` to the minted chroot path) + the one `task-delegation` mount at
// that path. Fixtures below are the venue-captured descriptor verbatim.
describe('resolveWorkbookMount — the task-invocation shape (R3-754)', () => {
  const probedInput = { task: 'open-workbook', params: { dir: '/task/task-1/dir' } };
  const probedDelegation = mount({
    id: '/task/task-1/dir',
    path: '/task/task-1/dir',
    type: 'task-delegation',
    mode: 'ro',
  });

  it('the probed contract resolves: the delegation at the input’s dir, via task-invocation, carrying the mount', () => {
    const mounts = [mount({ id: 'app', path: '/app', type: 'app' }), probedDelegation];
    expect(resolveWorkbookMount(mounts, probedInput)).toEqual({
      ok: true,
      root: '/task/task-1/dir',
      via: 'task-invocation',
      mount: probedDelegation,
    });
  });

  it('the carried mount keeps the probed mode — an ro caller folder yields an ro delegation (the door’s positive-rw gate reads it, never inverted)', () => {
    const r = resolveWorkbookMount([probedDelegation], probedInput);
    if (!r.ok) throw new Error('expected ok');
    expect(r.mount.mode).toBe('ro');
    const rw = mount({ id: '/task/task-1/dir', path: '/task/task-1/dir', type: 'task-delegation', mode: 'rw' });
    const r2 = resolveWorkbookMount([rw], probedInput);
    if (!r2.ok) throw new Error('expected ok');
    expect(r2.mount.mode).toBe('rw');
  });

  it('a delegation mount whose id (not path) matches the dir also resolves', () => {
    const byId = mount({ id: '/task/task-1/dir', path: '/mnt/other', type: 'task-delegation', mode: 'ro' });
    const r = resolveWorkbookMount([byId], probedInput);
    if (!r.ok) throw new Error('expected ok');
    expect(r.mount).toBe(byId);
  });

  it('a task-delegation mount WITHOUT the input is not guessed at — the input is the task shape’s mark', () => {
    expect(resolveWorkbookMount([probedDelegation])).toEqual({ ok: false, reason: 'not-dispatched' });
    expect(resolveWorkbookMount([probedDelegation], null)).toEqual({ ok: false, reason: 'not-dispatched' });
  });

  it('an input for a different task resolves nothing here', () => {
    const other = { task: 'open-wiki', params: { dir: '/task/task-1/dir' } };
    expect(resolveWorkbookMount([probedDelegation], other)).toEqual({ ok: false, reason: 'not-dispatched' });
  });

  it('an input whose dir finds no matching delegation falls through to the repo-load mark, else not-dispatched', () => {
    expect(resolveWorkbookMount([mount({ id: 'app', path: '/app', type: 'app' })], probedInput)).toEqual({
      ok: false,
      reason: 'not-dispatched',
    });
    const wb = mount({ id: 'content:o/r', path: '/mnt/h', type: 'content', mode: 'rw' });
    expect(resolveWorkbookMount([wb], probedInput)).toEqual({ ok: true, root: '/mnt/h', via: 'repo-load', mount: wb });
  });

  it('a non-string dir param is ignored, not crashed on', () => {
    expect(resolveWorkbookMount([probedDelegation], { task: 'open-workbook', params: { dir: 42 } })).toEqual({
      ok: false,
      reason: 'not-dispatched',
    });
    expect(resolveWorkbookMount([probedDelegation], { task: 'open-workbook', params: {} })).toEqual({
      ok: false,
      reason: 'not-dispatched',
    });
  });

  it('two delegations at the input’s dir is a host bug we refuse', () => {
    const dup = mount({ id: '/task/task-1/dir', path: '/task/task-1/dir', type: 'task-delegation', mode: 'rw' });
    expect(resolveWorkbookMount([probedDelegation, dup], probedInput)).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('both shapes claiming one frame (a content mark AND a matched delegation) is refused, not picked between', () => {
    const wb = mount({ id: 'content:o/r', path: '/mnt/h', type: 'content', mode: 'rw' });
    expect(resolveWorkbookMount([wb, probedDelegation], probedInput)).toEqual({ ok: false, reason: 'ambiguous' });
  });
});
