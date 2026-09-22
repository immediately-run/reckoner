// @vitest-environment happy-dom
// The edit door's stateful half (DOCUMENT_NAVIGATOR_SPEC §4, R3-447): writability by
// the positive `rw` check, both refusal channels with the latch, the silent cases,
// and the staleness signal — driven through the real hook over a mounted probe, with
// ONLY the SDK's tasks module mocked (its dynamic import is the seam §4.1 exists
// for; everything else is the real hook). G-DN-B2/B5's unit halves; the
// host-exercised halves run on the venue against the real gate.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useEditFile } from './useEditFile.ts';
import type { SandboxMount } from '@immediately-run/sdk';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const invokeTask = vi.fn();
const capFile = vi.fn((ref: unknown, opts: unknown) => ({ ref, opts, capped: true }));
vi.mock('@immediately-run/sdk/tasks', () => ({ invokeTask: (...a: unknown[]) => invokeTask(...a), capFile: (ref: unknown, opts: unknown) => capFile(ref, opts) }));

const mount = (over: Partial<SandboxMount>): SandboxMount =>
  ({ id: 'content:o/r', path: '/mnt/h', type: 'content', mode: 'rw', ...over }) as SandboxMount;

interface Probe {
  canEditPath: (rel: string) => boolean;
  onEdit: (rel: string) => void;
  notice: string | null;
  edited: boolean;
  clearStale: () => void;
}

let probe: Probe | null = null;
let root: Root | null = null;

function renderHook(m: SandboxMount | null): void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(() => {
        probe = useEditFile(m);
        return null;
      }),
    );
  });
}

function unmount(): void {
  act(() => root?.unmount());
  probe = null;
}

beforeEach(() => {
  invokeTask.mockReset();
  capFile.mockClear();
});

async function edit(rel = 'worksheets/review.sheet.js'): Promise<void> {
  await act(async () => {
    probe?.onEdit(rel);
  });
}

describe('useEditFile', () => {
  it('writable only by the POSITIVE rw check (DN-R2): ro and absent are not doors', () => {
    renderHook(mount({ mode: 'rw' }));
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(true);
    unmount();
    renderHook(mount({ mode: 'ro' }));
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(false);
    unmount();
    renderHook(null);
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(false);
    unmount();
  });

  it('a path failing the §4.3 gate is never a door, and onEdit declines it silently', async () => {
    renderHook(mount({}));
    expect(probe!.canEditPath('worksheets/../../evil.sheet.js')).toBe(false);
    await edit('worksheets/../../evil.sheet.js');
    expect(invokeTask).not.toHaveBeenCalled();
    expect(probe!.notice).toBeNull();
    unmount();
  });

  it('the call addresses the descriptor id (the universal scheme:locator form); a mount with no id is not a door', async () => {
    renderHook(mount({ id: 'content:owner/repo' }));
    await edit();
    expect(capFile).toHaveBeenCalledWith({ mountId: 'content:owner/repo', relPath: 'worksheets/review.sheet.js' }, { mode: 'rw' });
    unmount();
    // fail-closed: the host's grant lookup is an exact match on the mountId and no
    // fallback is documented, so an id-less mount never gets a doomed call
    renderHook(mount({ id: undefined, path: '/mnt/fallback' }));
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(false);
    await edit();
    expect(invokeTask).toHaveBeenCalledTimes(1); // only the earlier addressed call — no doomed one
    unmount();
  });

  it('saved:true flips the staleness signal; clearStale() resets it (§4.4)', async () => {
    renderHook(mount({}));
    invokeTask.mockResolvedValue({ saved: true });
    await edit();
    expect(probe!.edited).toBe(true);
    expect(probe!.notice).toBeNull();
    act(() => probe!.clearStale());
    expect(probe!.edited).toBe(false);
    unmount();
  });

  it('the result-carried refusal (saved:false) draws one plain message and latches the door off (DN-R1)', async () => {
    renderHook(mount({}));
    invokeTask.mockResolvedValue({ saved: false });
    await edit();
    expect(probe!.notice).toBe('This document can’t be edited here.');
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(false);
    unmount();
  });

  it('forbidden (the rejection channel) latches too, and the latch re-arms when the mount state changes', async () => {
    renderHook(mount({ id: 'content:a/b', mode: 'rw' }));
    invokeTask.mockRejectedValue(Object.assign(new Error('no'), { code: 'forbidden' }));
    await edit();
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(false);
    unmount();
    // the latch is SESSION-scoped ("repeated dead clicks"), not durable: a fresh instance
    // (a reloaded app) re-offers once — and a mount that is not rw is never a door anyway.
    renderHook(mount({ id: 'content:a/b', mode: 'ro' }));
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(false); // ro is not a door either way
    unmount();
    renderHook(mount({ id: 'content:a/b', mode: 'rw' }));
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(true);
    unmount();
  });

  it('cancelled is silent; other codes name themselves; a host-less boot is a no-op (§4.1/§4.2)', async () => {
    renderHook(mount({}));
    invokeTask.mockRejectedValue(Object.assign(new Error('dismissed'), { code: 'cancelled' }));
    await edit();
    expect(probe!.notice).toBeNull();
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(true);
    invokeTask.mockRejectedValue(Object.assign(new Error('slow'), { code: 'timeout' }));
    await edit();
    expect(probe!.notice).toBe('Couldn’t open the editor (timeout).');
    expect(probe!.canEditPath('worksheets/x.sheet.js')).toBe(true); // not latched
    invokeTask.mockRejectedValue(new Error('SDK invokeTask: no host transport'));
    await edit();
    expect(probe!.notice).toBeNull();
    unmount();
  });
});
