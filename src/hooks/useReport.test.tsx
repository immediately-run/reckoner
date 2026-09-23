// The report hook's reload half (DOCUMENT_NAVIGATOR_SPEC §4.4, R3-447): the session
// reads the document once, so `reload()` must rebuild it through the same mount
// resolution. The session builder is mocked (its real pipeline has its own suite);
// what this pins is the LIFECYCLE: one build per mount/seed state, and one MORE on
// reload — with nothing remounting.
//
// R3-768 also freezes the hook's feed surface: no seed starts a `FeedRuntime`. That
// invariant is asserted here too — a reintroduced feed path would construct the module
// and fail the guardrail.
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useReport, type ReportState } from './useReport.ts';
import { MERIDIAN_SEED, CALDERA_SEED, type SeedDocument } from '../seed/seeds.ts';
import type { ReportSession } from '../app/reportSession.ts';
import type { SandboxMount } from '@immediately-run/sdk';
import type { TaskInput } from '@immediately-run/sdk/tasks';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const buildReportSession = vi.fn();
vi.mock('../app/reportSession.ts', async (importOriginal) => {
  const real = (await importOriginal<typeof import('../app/reportSession.ts')>()) as Record<string, unknown>;
  return { ...real, buildReportSession: (...a: unknown[]) => buildReportSession(...a) };
});

// R3-768 guardrail: the hook must never construct a FeedRuntime (no bundled seed reads
// a live feed). If this is ever instantiated, a feed path was reintroduced.
const FeedRuntime = vi.fn();
vi.mock('../feed/index.ts', () => ({ FeedRuntime }));

const mounts: readonly import('@immediately-run/sdk').SandboxMount[] = [];
const session = { title: 't', tick: 0 } as unknown as ReportSession;
buildReportSession.mockResolvedValue(session);

interface Handle {
  state: ReportState & { reload: () => void };
}

let handle: Handle | null = null;

function mountHook(seed: SeedDocument): void {
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
    mountHook(MERIDIAN_SEED);
    // flush the async build
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(1);
    act(() => handle!.state.reload());
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(2);
    expect(handle!.state.reload).toBeTypeOf('function');
  });

  it('never constructs a FeedRuntime for any bundled seed (R3-768)', async () => {
    mountHook(MERIDIAN_SEED);
    await act(async () => {});
    mountHook(CALDERA_SEED);
    await act(async () => {});
    expect(FeedRuntime).not.toHaveBeenCalled();
  });
});

// The R3-754 handoff: the task input must ride through the hook into the session
// builder, and its arrival (the host's re-send ladder lands it AFTER the delegation
// mount) must trigger the rebuild. Both cases render a STABLE component identity so
// a re-render is a re-render, not a remount — the second build has to come from the
// deps/dispatch-key flip, not from a fresh hook.
//
// (Rebase note, 2026-09-29: the PR's third case — "the resolved task shape keeps the
// demo feed off the mounted workbook" — is dropped here as subsumed: R3-768 removed
// the feed runtimes wholesale, and the guardrail above asserts no FeedRuntime is EVER
// constructed. The dispatchKey-carries-taskInput property it existed to pin is covered
// by the late-arrival case below.)
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
      root.render(createElement(Probe, { s: MERIDIAN_SEED, m: taskMounts, t: taskInput }));
    });
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(1);
    expect(buildReportSession.mock.calls[0]).toEqual([undefined, MERIDIAN_SEED, taskMounts, taskInput]);
    act(() => root.unmount());
  });

  it('the input arriving AFTER the first build rebuilds once more, carrying it', async () => {
    buildReportSession.mockClear();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(createElement(Probe, { s: MERIDIAN_SEED, m: taskMounts, t: null }));
    });
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(1);
    act(() => {
      root.render(createElement(Probe, { s: MERIDIAN_SEED, m: taskMounts, t: taskInput }));
    });
    await act(async () => {});
    expect(buildReportSession).toHaveBeenCalledTimes(2);
    expect(buildReportSession.mock.calls[1]).toEqual([undefined, MERIDIAN_SEED, taskMounts, taskInput]);
    act(() => root.unmount());
  });
});
