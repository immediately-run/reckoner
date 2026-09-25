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
