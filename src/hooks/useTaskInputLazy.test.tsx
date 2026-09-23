// @vitest-environment happy-dom
// The lazy task-input reader (R3-754): the bounded poll standing in for the
// subscription the SDK does not export, with ONLY the SDK tasks module mocked (the
// dynamic-import seam the platform guard exists for — the same seam
// useEditFile.test.tsx drives) and fake timers on the interval. What must hold:
// the arrival STOPS the poll forever, the bounded window expires and never
// resumes, and only the discriminated no-host-transport rejection stays silent —
// every other rejection surfaces, because a dispatched task frame that cannot read
// its input renders the demo document with no signal while the caller's overlay
// waits on a completeTask that never comes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useTaskInputLazy } from './useTaskInputLazy.ts';
import type { TaskInput } from '@immediately-run/sdk/tasks';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getTaskInput = vi.fn();
vi.mock('@immediately-run/sdk/tasks', () => ({ getTaskInput: () => getTaskInput() }));

const INPUT = { task: 'open-workbook', params: { dir: '/task/task-1/dir' } } as TaskInput;

let value: TaskInput | null = null;
let root: Root | null = null;

function renderHook(): void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(() => {
        value = useTaskInputLazy();
        return null;
      }),
    );
  });
}

function unmount(): void {
  act(() => root?.unmount());
  root = null;
  value = null;
}

const settle = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  getTaskInput.mockReset();
});

afterEach(() => {
  if (root) unmount();
  vi.useRealTimers();
});

describe('useTaskInputLazy', () => {
  it('reads immediately, polls at 500ms, and the arrival STOPS the poll forever', async () => {
    getTaskInput.mockReturnValue(null);
    renderHook();
    await settle(0);
    expect(value).toBeNull();
    expect(getTaskInput).toHaveBeenCalledTimes(1); // the immediate read, not the interval

    await settle(1000); // two 500ms ticks, still null
    expect(getTaskInput).toHaveBeenCalledTimes(3);

    getTaskInput.mockReturnValue(INPUT);
    await settle(500);
    expect(value).toEqual(INPUT);

    const atArrival = getTaskInput.mock.calls.length;
    await settle(60_000); // the interval is cleared — deleting clearInterval ships this red
    expect(getTaskInput).toHaveBeenCalledTimes(atArrival);
  });

  it('expires after the bounded window (60 tries) and never resumes', async () => {
    getTaskInput.mockReturnValue(null);
    renderHook();
    await settle(120_000); // well past 60 × 500ms
    expect(value).toBeNull();
    const atExpiry = getTaskInput.mock.calls.length;
    // the immediate read + at most the 60 poll reads — deleting the tries cap ships this red
    expect(atExpiry).toBeLessThanOrEqual(61);

    await settle(120_000);
    expect(getTaskInput).toHaveBeenCalledTimes(atExpiry);
  });

  it('the discriminated no-host-transport rejection is the SILENT case (plain `vite dev`, vitest)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getTaskInput.mockImplementation(() => {
      throw new Error('immediately.run: no host transport');
    });
    renderHook();
    await settle(1000);
    expect(value).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('any OTHER rejection surfaces — a dispatched frame must not fail silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getTaskInput.mockImplementation(() => {
      throw new Error('module eval exploded');
    });
    renderHook();
    await settle(1000);
    expect(value).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('unmount stops the poll (interval cleanup + the alive guard)', async () => {
    getTaskInput.mockReturnValue(null);
    renderHook();
    await settle(0);
    unmount();
    const atUnmount = getTaskInput.mock.calls.length;
    await settle(60_000);
    expect(getTaskInput).toHaveBeenCalledTimes(atUnmount);
  });
});
