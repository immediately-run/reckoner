// The author's view (AUTHORS_VIEW_SPEC §1) — the document describing itself, rendered
// in place of the report under a small header with an explicit way back (§1.2: the view
// is component state, not a route; browser back exits the app, as it does for every
// panel today). The node tree is the document's own author's-view template or the
// built-in scaffold (session-selected, §4); the reflection port is provided HERE and
// only here (§6 — the restriction is structural).
import { useMemo } from 'react';
import type { SubjectResult } from '../engine/worker/protocol.ts';
import { ReportView } from '../report/index.ts';
import type { Bindings } from '../report/index.ts';
import { buildReflectionPort } from './authorsView.ts';
import type { ReportSession } from './reportSession.ts';
import './workbook-panel.css';

interface AuthorsViewProps {
  session: ReportSession;
  bindings: Bindings;
  /** The app-level suite results — the SAME object every review surface renders (G-AV-10). */
  verdicts: ReadonlyMap<string, SubjectResult> | null;
  onClose: () => void;
}

function AuthorsView({ session, bindings, verdicts, onClose }: AuthorsViewProps) {
  const reflection = useMemo(
    () => buildReflectionPort(session.engine, session.loaded, verdicts),
    [session, verdicts],
  );

  return (
    <section className="rk-authors" aria-label="Author's view">
      <header className="rk-authors-head">
        <span className="rk-authors-title">
          {session.title} — author's view
          {!session.authorsFromDocument && <span className="rk-scratch-tag">default</span>}
        </span>
        <button type="button" className="rk-wb-close" onClick={onClose}>
          Back to report
        </button>
      </header>
      <ReportView nodes={session.authorsNodes} bindings={bindings} reflection={reflection} />
    </section>
  );
}

export default AuthorsView;
