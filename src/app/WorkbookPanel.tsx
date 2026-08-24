// The review surface — workbook panel (design brief surface 3; §6). One card per cell:
// name, doc, value preview, and the **coverage state** chip; test cards render beneath their
// subject with kind labels. The verdict rule is load-bearing (§6, review-2): `validated`
// requires a non-example-based leg (metamorphic/property); example-only coverage reads
// `pinned`, never "tested" — the four states must stay visually distinct or the testing
// story is theater. Author-side surface (viewers never see worksheets, brief A3): opened
// from the report header, closed by default, run-mode report untouched. Card clicks open
// the value inspector (App owns the inspected cell, shared with the on-pixel affordance).
import type { AsyncEngine } from '../engine/asyncEngine.ts';
import { useVerdicts } from '../hooks/useVerdicts.ts';
import WorkbookPanelBody from './WorkbookPanelBody.tsx';
import './workbook-panel.css';

interface WorkbookPanelProps {
  engine: AsyncEngine;
  /** The report's re-render tick — suites re-run when the workbook recomputes. */
  tick: number;
  /** Open the value inspector on a cell (card click). */
  onInspect: (cellId: string) => void;
  onClose: () => void;
}

function WorkbookPanel({ engine, tick, onInspect, onClose }: WorkbookPanelProps) {
  const { results, error } = useVerdicts(engine, tick);

  return (
    <aside className="rk-wb-panel" aria-label="Workbook review">
      <header className="rk-wb-head">
        <h2>Workbook</h2>
        <button type="button" className="rk-wb-close" onClick={onClose}>
          Close
        </button>
      </header>
      {error !== null && <div className="rk-wb-error">{error}</div>}
      {results === null && error === null && <div className="rk-wb-note">Running suites…</div>}
      <WorkbookPanelBody
        cells={engine.cells()}
        tests={engine.tests()}
        results={results}
        valueOf={(id) => engine.value(id)}
        onInspect={onInspect}
      />
    </aside>
  );
}

export default WorkbookPanel;
