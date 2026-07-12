// Root component — immediately.run renders the default export of THIS file (ARCHITECTURE_PLAN
// §2.1, §7). Reckoner opens a document and renders it as a static report with zero prompts:
// the hook loads the bundled demo document, runs the SES-confined engine, and hands the render
// surface a Bindings port over the results. Global CSS is imported here (not main.tsx), which
// immediately.run's runtime ignores.
import './index.css';
import './app/report-page.css';
import { useEffect } from 'react';
import { useReport } from './hooks/useReport.ts';
import { ReportView } from './report/index.ts';

function App() {
  const report = useReport();
  const title = report.status === 'ready' ? report.session.title : undefined;
  useEffect(() => {
    if (title !== undefined) document.title = title;
  }, [title]);
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
          </header>
          <ReportView nodes={report.session.nodes} bindings={report.bindings} />
        </>
      )}
    </main>
  );
}

export default App;
