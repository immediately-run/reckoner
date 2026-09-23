// The report hook's reload half (DOCUMENT_NAVIGATOR_SPEC §4.4, R3-447): the session
// reads the document once, so `reload()` must rebuild it through the same mount
// resolution. The session builder is mocked (its real pipeline has its own suite);
// what this pins is the LIFECYCLE: one build per mount/seed state, and one MORE on
// reload — with nothing remounting.
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useReport, type ReportState } from './useReport.ts';
import type { ReportSession } from '../app/reportSession.ts';
import type { SeedDocument } from '../app/reportSession.ts';
import type { SandboxMount } from '@immediately-run/sdk';
import type { TaskInput } from '@immediately-run/sdk/tasks';
import { FeedRuntime } from '../feed/index.ts';

// The demo-feed gate is the observable consequence of the dispatchKey memo carrying
// the task input: under the task shape the key is 'task-invocation:<root>', never
// '' — so the feed must NOT start over the mounted workbook's session. The mock
// captures the construction the gate would otherwise perform on the real runtime.
vi.mock('../feed/index.ts', () => ({
  FeedRuntime: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));
vi.mock('../app/demoFeed.ts', () => ({
  demoLiveConnector: () => ({}),
  DEMO_FEED_NAME: 'demo',
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const buildReportSession = vi.fn();
vi.mock('../app/reportSession.ts', async (importOriginal) => {
  const real = (await importOriginal<typeof import('../app/reportSession.ts')>()) as Record<string, unknown>;
  return { ...real, buildReportSession: (...a: unknown[]) => buildReportSession(...a) };
});

const seed = {} as SeedDocument;
const mounts: readonly import('@immediately-run/sdk').SandboxMount[] = [];
const session = { title: 't', tick: 0 } as unknown as ReportSession;
buildReportSession.mockResolvedValue(session);

interface Handle {
  state: ReportState & { reload: () => void };
}

let handle: Handle | null = null;

function mountHook(): void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(() => {
        handle = { state: useReport(seed, mounts) };
        return null;
      }),
    );
  });
}

describe('useReport — reload (§4.4)', () => {
  it('builds once for a stable mount set, and once more on reload()', async () => {
    mountHook();
    // flush the async build
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(1);
    act(() => handle!.state.reload());
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(2);
    expect(handle!.state.reload).toBeTypeOf('function');
  });
});

// The R3-754 handoff: the task input must ride through the hook into the session
// builder, and its arrival (the host's re-send ladder lands it AFTER the delegation
// mount) must trigger the rebuild. Both cases render a STABLE component identity so
// a re-render is a re-render, not a remount — the second build has to come from the
// deps/dispatch-key flip, not from a fresh hook.
const TASK_DIR = '/task/task-1/dir';
const taskMounts = [
  { id: TASK_DIR, path: TASK_DIR, type: 'task-delegation', mode: 'ro' },
] as unknown as SandboxMount[];
const taskInput = { task: 'open-workbook', params: { dir: TASK_DIR } } as TaskInput;

function Probe(props: { s: SeedDocument; m: readonly SandboxMount[]; t: TaskInput | null }): null {
  useReport(props.s, props.m, props.t);
  return null;
}

describe('useReport — the task-input handoff (R3-754)', () => {
  it('the input rides into buildReportSession as the 4th argument — dropping it there fails here', async () => {
    buildReportSession.mockClear();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(createElement(Probe, { s: seed, m: taskMounts, t: taskInput }));
    });
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(1);
    expect(buildReportSession.mock.calls[0]).toEqual([undefined, seed, taskMounts, taskInput]);
    act(() => root.unmount());
  });

  it('the input arriving AFTER the first build rebuilds once more, carrying it', async () => {
    buildReportSession.mockClear();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(createElement(Probe, { s: seed, m: taskMounts, t: null }));
    });
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(1);
    act(() => {
      root.render(createElement(Probe, { s: seed, m: taskMounts, t: taskInput }));
    });
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(2);
    expect(buildReportSession.mock.calls[1]).toEqual([undefined, seed, taskMounts, taskInput]);
    act(() => root.unmount());
  });

  it('the resolved task shape keeps the demo feed OFF the mounted workbook — dropping taskInput from the dispatchKey memo fails here', async () => {
    buildReportSession.mockClear();
    vi.mocked(FeedRuntime).mockClear();
    const demoSeed = { demoFeed: true } as SeedDocument;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(createElement(Probe, { s: demoSeed, m: taskMounts, t: taskInput }));
    });
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(1);
    // dispatchKey is 'task-invocation:/task/task-1/dir', never '' — the gate holds
    expect(FeedRuntime).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
