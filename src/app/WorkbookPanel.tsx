// The review surface — workbook panel (design brief surface 3; §6). One card per cell:
// name, doc, value preview, and the **coverage state** chip; test cards render beneath their
// subject with kind labels. The verdict rule is load-bearing (§6, review-2): `validated`
// requires a non-example-based leg (metamorphic/property); example-only coverage reads
// `pinned`, never "tested" — the four states must stay visually distinct or the testing
// story is theater. Author-side surface (viewers never see worksheets, brief A3): opened
// from the report header, closed by default, run-mode report untouched.
import { useEffect, useState } from 'react';
import type { AsyncEngine } from '../engine/asyncEngine.ts';
import type { SubjectResult } from '../engine/worker/protocol.ts';
import WorkbookPanelBody from './WorkbookPanelBody.tsx';
import ValueInspector from './ValueInspector.tsx';
import './workbook-panel.css';

interface WorkbookPanelProps {
  engine: AsyncEngine;
  /** The report's re-render tick — suites re-run when the workbook recomputes. */
  tick: number;
  onClose: () => void;
}

function WorkbookPanel({ engine, tick, onClose }: WorkbookPanelProps) {
  const [results, setResults] = useState<Map<string, SubjectResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspected, setInspected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    engine
      .runTests()
      .then((r) => {
        if (alive) {
          setResults(r);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [engine, tick]);

  const inspectedCell = inspected === null ? null : engine.cells().find((c) => c.id === inspected) ?? null;

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
      {inspectedCell !== null && (
        <ValueInspector
          cell={inspectedCell}
          tests={engine.tests().filter((t) => t.subject === inspectedCell.id)}
          outcome={results?.get(inspectedCell.id)}
          result={engine.result(inspectedCell.id)}
          onNavigate={setInspected}
          onClose={() => setInspected(null)}
        />
      )}
      <WorkbookPanelBody
        cells={engine.cells()}
        tests={engine.tests()}
        results={results}
        valueOf={(id) => engine.value(id)}
        onInspect={setInspected}
      />
    </aside>
  );
}

export default WorkbookPanel;
