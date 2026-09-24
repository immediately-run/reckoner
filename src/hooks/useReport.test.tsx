// The report hook's reload half (DOCUMENT_NAVIGATOR_SPEC §4.4, R3-447) and the R3-766
// change-watch half: the session reads the document once, so `reload()` — and, on a
// dispatched mount, the `watchDocument` callback — must rebuild it through the same
// mount resolution. The session builder and the watch are mocked (their real pipelines
// have their own suites); what this pins is the LIFECYCLE.
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useReport, type ReportState } from './useReport.ts';
import type { ReportSession } from '../app/reportSession.ts';
import type { SeedDocument } from '../app/reportSession.ts';
import type { SandboxMount } from '@immediately-run/sdk';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const buildReportSession = vi.fn();
vi.mock('../app/reportSession.ts', async (importOriginal) => {
  const real = (await importOriginal<typeof import('../app/reportSession.ts')>()) as Record<string, unknown>;
  return { ...real, buildReportSession: (...a: unknown[]) => buildReportSession(...a) };
});

const { watchDocument } = vi.hoisted(() => ({ watchDocument: vi.fn() }));
vi.mock('../document/watchDocument.ts', () => ({ watchDocument }));

const seed = {} as SeedDocument;
const session = { title: 't', tick: 0 } as unknown as ReportSession;
buildReportSession.mockResolvedValue(session);

const contentMount = (path: string): SandboxMount => ({ type: 'content', path, id: 'content:owner/repo', mode: 'rw' });

type State = ReportState & { reload: () => void };
const stateRef: { current: State | null } = { current: null };

function Probe({ mounts }: { mounts: readonly SandboxMount[] }) {
  const state = useReport(seed, mounts);
  // Capture outside render (the hook result is a new object each render; effects are
  // the sanctioned place to store it, keeping the component body side-effect-free).
  useEffect(() => {
    stateRef.current = state;
  });
  return null;
}

let root: Root | null = null;

function render(mounts: readonly SandboxMount[]): void {
  if (root === null) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root!.render(createElement(Probe, { mounts })));
}

const flush = () => act(async () => {});

beforeEach(() => {
  root = null;
  stateRef.current = null;
  buildReportSession.mockClear();
  watchDocument.mockClear();
});

describe('useReport — reload (§4.4)', () => {
  it('builds once for a stable mount set, and once more on reload()', async () => {
    render([]);
    await flush();
    expect(buildReportSession).toHaveBeenCalledTimes(1);
    act(() => stateRef.current!.reload());
    await flush();
    expect(buildReportSession).toHaveBeenCalledTimes(2);
    expect(stateRef.current!.reload).toBeTypeOf('function');
  });
});

describe('useReport — change-watch (R3-766)', () => {
  it('the seed documents never start a watch, and watching is false', async () => {
    render([]);
    await flush();
    expect(watchDocument).not.toHaveBeenCalled();
    expect(stateRef.current!.watching).toBe(false);
  });

  it('a dispatched mount starts a watch, and its onChange rebuilds once more', async () => {
    render([contentMount('/dispatched')]);
    await flush();
    expect(watchDocument).toHaveBeenCalledTimes(1);
    expect(stateRef.current!.watching).toBe(true);

    // The watch callback is the reload half — driving it rebuilds the session.
    const onChange = watchDocument.mock.calls[0][1] as () => void;
    const before = buildReportSession.mock.calls.length;
    act(() => onChange());
    await flush();
    expect(buildReportSession.mock.calls.length).toBe(before + 1);
  });

  it('changing the mount root aborts the first watch before starting the next', async () => {
    render([contentMount('/first')]);
    await flush();
    const firstSignal = watchDocument.mock.calls[0][2].signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    render([contentMount('/second')]);
    await flush();
    expect(watchDocument.mock.calls.length).toBe(2);
    expect(firstSignal.aborted).toBe(true);
    expect(watchDocument.mock.calls[1][2].signal).not.toBe(firstSignal);
  });
});
