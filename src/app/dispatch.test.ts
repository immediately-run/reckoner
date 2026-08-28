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
  it('the repo-load mark: the one mount typed "content" is the workbook root', () => {
    const mounts = [
      mount({ id: 'app', path: '/app', type: 'app' }),
      mount({ id: 'wb', path: '/task/7/dir', type: 'content', mode: 'ro' }),
    ];
    expect(resolveWorkbookMount(mounts)).toEqual({ ok: true, root: '/task/7/dir', via: 'repo-load' });
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
