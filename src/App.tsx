// Root component — the default export of THIS file is what renders. immediately.run reaches it
// through `src/platform.tsx` (`package.json` → `main`), which exists only to call
// `boot({ children: <App /> })` so the app owns a path space (R3-553); `src/main.tsx` is the
// `vite dev` entry and is ignored at runtime (ARCHITECTURE_PLAN §2.1, §7). Reckoner opens a document and renders it as a static report with zero prompts:
// the hook loads the bundled demo document, runs the SES-confined engine, and hands the render
// surface a Bindings port over the results. Global CSS is imported here (not main.tsx), which
// immediately.run's runtime ignores.
//
// The inspected cell is app-level state shared by the two doors into the value inspector:
// the workbook panel's cards (author surface) and V3's on-pixel affordance on bound report
// elements (hover-reveal / long-press) — both open the same docked inspector.
import './index.css';
import './app/report-page.css';
import { useEffect, useMemo, useState } from 'react';
import { useReport } from './hooks/useReport.ts';
import { seedForBoot } from './seed/seeds.ts';
import { useAppPath, useHostLocation } from './hooks/useAppPath.ts';
import DocumentNav from './app/DocumentNav.tsx';
import DocumentChangedNotice from './app/DocumentChangedNotice.tsx';
import { useMounts } from './hooks/useMounts.ts';
import { resolveWorkbookMount } from './app/dispatch.ts';
import { useEditFile } from './hooks/useEditFile.ts';
import { ReportView } from './report/index.ts';
import WorkbookPanel from './app/WorkbookPanel.tsx';
import ValueInspector from './app/ValueInspector.tsx';
import WhatIfPanel from './app/WhatIfPanel.tsx';
import AuthorsView from './app/AuthorsView.tsx';
import { useOverlayDialog } from './app/useOverlayDialog.ts';
import { useVerdicts } from './hooks/useVerdicts.ts';

function App() {
  // The app-space PATH picks the bundled document (`/caldera`; `/` is the Meridian
  // monthly review), falling back to the legacy `?doc=` query — which the host forwards only
  // at boot, so it cannot survive navigation and is compatibility only (R3-553). The picked
  // seed is a module constant, so the reference is stable across renders.
  const appPath = useAppPath();
  const hostLoc = useHostLocation();
  const mounts = useMounts();
  const seed = seedForBoot(appPath, window.location);
  const report = useReport(seed, mounts);
  // Part B (R3-447): the dispatched workbook's edit door. The mount the resolution
  // carries is the whole contract — writability by the positive `rw` check, and the
  // `capFile` address from the descriptor's universal id. Absent (never disabled) in
  // the seed flow and on any non-`rw` mount.
  const dispatch = resolveWorkbookMount(mounts);
  const editFile = useEditFile(dispatch.ok ? dispatch.mount : null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [inspected, setInspected] = useState<string | null>(null);
  // What-if buffer text is SESSION-SCOPED app state (WHATIF_SHADOW_EVALUATION_SPEC §1.4):
  // closing a panel must never destroy typed source, so the per-cell variants and the
  // scratch pad's buffer live here, above the panels' mount/unmount lifecycle.
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [scratchText, setScratchText] = useState('');
  // The what-if section is collapsed by default (spec §1.1, amended 2026-08-28): the
  // formula row's "what if →" affordance opens it, and it stays open on its own whenever
  // the cell's variant text differs from the document formula — typed source never hides.
  // Keyed by cell id rather than reset in an effect: navigating to another cell makes
  // the door closed again by derivation (react-hooks/set-state-in-effect stays happy).
  const [whatIfOpenFor, setWhatIfOpenFor] = useState<string | null>(null);
  // The author's view (AUTHORS_VIEW_SPEC §1.2): opened from the workbook panel (its
  // door), rendered in place of the report with an explicit way back. Component state,
  // not a route.
  const [authorsOpen, setAuthorsOpen] = useState(false);
  const title = report.status === 'ready' ? report.session.title : undefined;
  useEffect(() => {
    if (title !== undefined) document.title = title;
  }, [title]);

  const inspectedCell =
    report.status === 'ready' && inspected !== null
      ? report.session.engine.cells().find((c) => c.id === inspected) ?? null
      : null;

  // V3's inspection port: bound elements offer hover/long-press inspection of the CELL they
  // display (externals — params/fixtures — have no inspector card, so no affordance there).
  const inspection = useMemo(
    () =>
      report.status === 'ready'
        ? {
            onInspect: setInspected,
            canInspect: (source: string) => report.session.engine.cells().some((c) => c.id === source),
          }
        : null,
    [report],
  );

  const verdicts = useVerdicts(
    report.status === 'ready' ? report.session.engine : null,
    report.status === 'ready' ? report.tick : 0,
  );

  // The inspector dock's dialog contract (R3-610) — focus in on open, Tab wrap, keyed
  // close, focus back to the card or report affordance that opened it — lives in one
  // hook; `enabled` flips with the dock's own conditional mount, so the effect and the
  // element appear together.
  const inspectorRef = useOverlayDialog<HTMLDivElement>(() => setInspected(null), {
    enabled: inspectedCell !== null,
  });

  return (
    <main className="rk-page">
      {report.status === 'loading' && <div className="rk-page-note">Loading report…</div>}
      {report.status === 'error' && (
        <div className="rk-page-note rk-page-error">Could not load the report: {report.message}</div>
      )}
      {report.status === 'ready' && (
        <>
          <header className="rk-page-head">
            <DocumentNav loc={hostLoc} current={seed} />
            <h1 className="grad-text">{report.session.title}</h1>
            <button type="button" className="rk-review-toggle" onClick={() => setReviewOpen((v) => !v)}>
              {reviewOpen ? 'Close workbook' : 'Workbook'}
            </button>
          </header>
          {editFile.edited && (
            <DocumentChangedNotice
              onReload={() => {
                report.reload();
                editFile.clearStale();
              }}
            />
          )}
          {editFile.notice !== null && <div className="rk-stale rk-stale--note" role="status">{editFile.notice}</div>}
          {authorsOpen ? (
            <AuthorsView
              session={report.session}
              bindings={report.bindings}
              verdicts={verdicts.results}
              onClose={() => setAuthorsOpen(false)}
            />
          ) : (
            <ReportView nodes={report.session.nodes} bindings={report.bindings} inspection={inspection ?? undefined} />
          )}
          {reviewOpen && (
            <WorkbookPanel
              session={report.session}
              verdicts={verdicts}
              onInspect={setInspected}
              onClose={() => setReviewOpen(false)}
              onOpenAuthors={() => {
                setReviewOpen(false);
                setAuthorsOpen(true);
              }}
              scratchText={scratchText}
              onScratchChange={setScratchText}
            />
          )}
          {inspectedCell !== null && (
            <div className="rk-inspector-dock" role="dialog" aria-modal="true" aria-label="Value inspector" ref={inspectorRef}>
              <ValueInspector
                cell={inspectedCell}
                cells={report.session.engine.cells()}
                tests={report.session.engine.tests().filter((t) => t.subject === inspectedCell.id)}
                verdicts={verdicts.results}
                result={report.session.engine.result(inspectedCell.id)}
                onNavigate={setInspected}
                onClose={() => setInspected(null)}
                onWhatIf={() => setWhatIfOpenFor(inspectedCell.id)}
                worksheetPaths={Object.fromEntries(report.session.loaded.worksheets.map((w) => [w.name, w.path]))}
                canEditPath={editFile.canEditPath}
                onEdit={editFile.onEdit}
              />
              {(whatIfOpenFor === inspectedCell.id ||
                (variants[inspectedCell.id] !== undefined &&
                  variants[inspectedCell.id] !== inspectedCell.formulaSource)) && (
                <WhatIfPanel
                  session={report.session}
                  cell={inspectedCell}
                  baseVerdicts={verdicts.results}
                  text={variants[inspectedCell.id] ?? inspectedCell.formulaSource}
                  onTextChange={(cellId, text) => setVariants((v) => ({ ...v, [cellId]: text }))}
                />
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default App;
