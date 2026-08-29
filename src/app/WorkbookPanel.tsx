// The review surface — workbook panel (design brief surface 3; §6). One card per cell:
// name, doc, value preview, and the **coverage state** chip; test cards render beneath their
// subject with kind labels. The verdict rule is load-bearing (§6, review-2): `validated`
// requires a non-example-based leg (metamorphic/property); example-only coverage reads
// `pinned`, never "tested" — the four states must stay visually distinct or the testing
// story is theater. Author-side surface (viewers never see worksheets, brief A3): opened
// from the report header, closed by default, run-mode report untouched. Card clicks open
// the value inspector (App owns the inspected cell, shared with the on-pixel affordance).
//
// The vocabulary section (DOCUMENT_NAVIGATOR_SPEC Part A) rides at the bottom too —
// panel chrome, derived from the closed catalog, so "what can I use as an input knob?"
// has an answer inside the product.
//
// The scratch pad (WHATIF_SHADOW_EVALUATION_SPEC §1.2) rides at the bottom: an unsaved
// worksheet evaluated through the shadow session, sharing this panel's suite results as
// the verdict-diff base. Its buffer text is App-owned (§1.4 — survives panel close).
import type { SubjectResult } from '../engine/worker/protocol.ts';
import { summarizeSuite } from '../engine/suiteReport.ts';
import type { ReportSession } from './reportSession.ts';
import WorkbookPanelBody from './WorkbookPanelBody.tsx';
import ScratchPad from './ScratchPad.tsx';
import VocabularySection from './VocabularySection.tsx';
import './workbook-panel.css';

interface WorkbookPanelProps {
  session: ReportSession;
  /**
   * The app-level suite state (AUTHORS_VIEW_SPEC §3.4, G-AV-10): ONE `useVerdicts`
   * owned by App drives this panel, the inspector, and the author's view — the hook's
   * own "must not be computed twice" contract, previously violated by a second
   * instantiation here.
   */
  verdicts: {
    results: Map<string, SubjectResult> | null;
    error: string | null;
    running: boolean;
    rerun: () => void;
  };
  /** Open the value inspector on a cell (card click). */
  onInspect: (cellId: string) => void;
  onClose: () => void;
  /** Open the author's view (AUTHORS_VIEW_SPEC §1.2 — this panel is its door). */
  onOpenAuthors: () => void;
  /** The scratch pad's session-scoped buffer text (App owns it; spec §1.4). */
  scratchText: string;
  onScratchChange: (text: string) => void;
}

function WorkbookPanel({ session, verdicts, onInspect, onClose, onOpenAuthors, scratchText, onScratchChange }: WorkbookPanelProps) {
  const engine = session.engine;
  const { results, error, running, rerun } = verdicts;
  const cells = engine.cells();
  // S4a (R3-231): the workbook-level answer in one line, from the SAME verdicts the cards
  // below render — the in-platform equivalent of a test-runner summary, no terminal.
  const report = summarizeSuite(cells, results);

  return (
    <aside className="rk-wb-panel" aria-label="Workbook review">
      <header className="rk-wb-head">
        <h2>Workbook</h2>
        <div className="rk-wb-actions">
          <button type="button" className="rk-wb-run" onClick={rerun} disabled={running}>
            {running ? 'Running…' : 'Run suite'}
          </button>
          <button type="button" className="rk-wb-close" onClick={onOpenAuthors}>
            Author's view
          </button>
          <button type="button" className="rk-wb-close" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      {error !== null && <div className="rk-wb-error">{error}</div>}
      {results === null && error === null && <div className="rk-wb-note">Running suites…</div>}
      {results !== null && (
        <div className={`rk-wb-summary ${report.ok ? 'rk-wb-summary--ok' : 'rk-wb-summary--fail'}`} role="status">
          {report.line}
        </div>
      )}
      <WorkbookPanelBody
        cells={cells}
        tests={engine.tests()}
        results={results}
        valueOf={(id) => engine.value(id)}
        onInspect={onInspect}
      />
      <ScratchPad session={session} baseVerdicts={results} text={scratchText} onTextChange={onScratchChange} />
      <VocabularySection />
    </aside>
  );
}

export default WorkbookPanel;
