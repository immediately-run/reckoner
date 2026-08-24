// Root component — immediately.run renders the default export of THIS file (ARCHITECTURE_PLAN
// §2.1, §7). Reckoner opens a document and renders it as a static report with zero prompts:
// the hook loads the bundled demo document, runs the SES-confined engine, and hands the render
// surface a Bindings port over the results. Global CSS is imported here (not main.tsx), which
// immediately.run's runtime ignores.
import './index.css';
import './app/report-page.css';
import { useEffect, useState } from 'react';
import { useReport } from './hooks/useReport.ts';
import { ReportView } from './report/index.ts';
import WorkbookPanel from './app/WorkbookPanel.tsx';

function App() {
  const report = useReport();
  const [reviewOpen, setReviewOpen] = useState(false);
  const title = report.status === 'ready' ? report.session.title : undefined;
  useEffect(() => {
    if (title !== undefined) document.title = title;
  }, [title]);
  // Error-severity document diagnostics (a dangling feed/fixture reference, a malformed
  // file) render as a note above the report — the report still renders what it can, since
  // every affected cell degrades to its own missing-value state rather than failing the page.
  const errors =
    report.status === 'ready' ? report.session.diagnostics.filter((d) => d.severity === 'error') : [];
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
          {errors.length > 0 && (
            <div className="rk-page-note rk-page-error" role="alert">
              {errors.map((d, i) => (
                <div key={i}>{d.message}</div>
              ))}
            </div>
          )}
          <ReportView nodes={report.session.nodes} bindings={report.bindings} />
          {reviewOpen && (
            <WorkbookPanel
              engine={report.session.engine}
              tick={report.tick}
              onClose={() => setReviewOpen(false)}
            />
          )}
        </>
      )}
    </main>
  );
}

export default App;
