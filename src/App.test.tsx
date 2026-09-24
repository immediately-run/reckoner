// The §4.4 notice interplay (R3-766): when the change-watch is live a save through the
// editor has already refreshed the report, so the stale notice must be hidden while
// `report.watching` is true and shown once it is false. App is rendered with the heavy
// leaves and hooks mocked — the assertion is the notice's presence, not the leaves.
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let watchFlag = false;
let editEdited = true;

const clearStale = vi.fn();

vi.mock('./hooks/useReport.ts', () => ({
  useReport: () => ({
    status: 'ready',
    watching: watchFlag,
    reload: () => undefined,
    session: { title: 'T', nodes: [], engine: {}, loaded: { worksheets: [] } } as never,
    bindings: {} as never,
    tick: 0,
  }),
}));

vi.mock('./hooks/useEditFile.ts', () => ({
  useEditFile: () => ({ edited: editEdited, clearStale, canEditPath: () => false, onEdit: () => undefined, notice: null }),
}));

vi.mock('./hooks/useMounts.ts', () => ({ useMounts: () => [] }));
vi.mock('./hooks/useAppPath.ts', () => ({ useAppPath: () => '/', useHostLocation: () => ({}) }));
vi.mock('./hooks/useVerdicts.ts', () => ({ useVerdicts: () => ({ results: [] }) }));
vi.mock('./app/useOverlayDialog.ts', () => ({ useOverlayDialog: () => ({ current: null }) }));
vi.mock('./app/DocumentNav.tsx', () => ({ default: () => null }));
vi.mock('./report/index.ts', () => ({ ReportView: () => null }));
vi.mock('./app/DocumentChangedNotice.tsx', () => ({ default: () => createElement('div', { className: 'rk-stale' }, 'stale notice') }));

import App from './App.tsx';

function renderApp(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => root.render(createElement(App)));
  return container;
}

describe('App — the stale notice vs the change-watch', () => {
  it('hides the notice while the watch is live, and shows it once it is not', () => {
    watchFlag = true;
    editEdited = true;
    const watching = renderApp();
    expect(watching.querySelector('.rk-stale')).toBeNull();
    act(() => watching.remove());

    watchFlag = false;
    const unwatching = renderApp();
    expect(unwatching.querySelector('.rk-stale')?.textContent).toContain('stale notice');
    act(() => unwatching.remove());
  });
});
