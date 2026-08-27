// Root component — immediately.run renders the default export of THIS file (ARCHITECTURE_PLAN
// §2.1, §7). Reckoner opens a document and renders it as a static report with zero prompts:
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
import { CALDERA_SEED } from './app/reportSession.ts';
import { ReportView } from './report/index.ts';
import WorkbookPanel from './app/WorkbookPanel.tsx';
import ValueInspector from './app/ValueInspector.tsx';
import { useVerdicts } from './hooks/useVerdicts.ts';

function App() {
  const report = useReport(CALDERA_SEED);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [inspected, setInspected] = useState<string | null>(null);
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

  return (
    <main className="rk-page">
      {report.status === 'loading' && <div className="rk-page-note">Loading report…</div>}
      {report.status === 'error' && (
        <div className="rk-page-note rk-page-error">Could not load the report: {report.message}</div>
      )}
      {report.status === 'ready' && (
        <>
          <header className="rk-page-head">
            <h1 className="grad-text">{report.session.title}</h1>
            <button type="button" className="rk-review-toggle" onClick={() => setReviewOpen((v) => !v)}>
              {reviewOpen ? 'Close review' : 'Review'}
            </button>
          </header>
          <ReportView nodes={report.session.nodes} bindings={report.bindings} inspection={inspection ?? undefined} />
          {reviewOpen && (
            <WorkbookPanel
              engine={report.session.engine}
              tick={report.tick}
              onInspect={setInspected}
              onClose={() => setReviewOpen(false)}
            />
          )}
          {inspectedCell !== null && (
            <div className="rk-inspector-dock" role="dialog" aria-label="Value inspector">
              <ValueInspector
                cell={inspectedCell}
                cells={report.session.engine.cells()}
                tests={report.session.engine.tests().filter((t) => t.subject === inspectedCell.id)}
                outcome={verdicts.results?.get(inspectedCell.id)}
                result={report.session.engine.result(inspectedCell.id)}
                onNavigate={setInspected}
                onClose={() => setInspected(null)}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default App;
