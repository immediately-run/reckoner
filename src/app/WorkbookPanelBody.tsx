// The workbook panel's body — pure presentation of (cells, tests, verdicts), separated from
// the effect-owning shell (`WorkbookPanel.tsx`) so the card/verdict rendering is testable
// with `react-dom/server` (no DOM environment in this repo's suite).
import type { CellDescriptor, SubjectResult, TestDescriptor } from '../engine/worker/protocol.ts';
import type { CellVerdict } from '../engine/testrunner.ts';
import type { Value } from '../stdlib/types.ts';
import './workbook-panel.css';

const VERDICT_CLASS: Record<CellVerdict, string> = {
  validated: 'rk-verdict--validated',
  pinned: 'rk-verdict--pinned',
  untested: 'rk-verdict--untested',
  failing: 'rk-verdict--failing',
};

/** A one-line value preview: scalars as-is, structures JSON-truncated. */
function preview(value: Value | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  const json = JSON.stringify(value);
  return json === undefined ? '—' : json.length > 72 ? `${json.slice(0, 72)}…` : json;
}

interface WorkbookPanelBodyProps {
  cells: readonly CellDescriptor[];
  tests: readonly TestDescriptor[];
  /** Per-subject suite results; a subject absent from the map renders `untested`. */
  results: ReadonlyMap<string, SubjectResult> | null;
  /** Current value lookup for the preview line. */
  valueOf: (id: string) => Value | undefined;
  /** Open the value inspector on a cell (card click). */
  onInspect?: (cellId: string) => void;
}

function WorkbookPanelBody({ cells, tests, results, valueOf, onInspect }: WorkbookPanelBodyProps) {
  const worksheets = [...new Set(cells.map((c) => c.worksheet))];
  const grouped = new Map<string, TestDescriptor[]>();
  for (const t of tests) grouped.set(t.subject, [...(grouped.get(t.subject) ?? []), t]);

  return (
    <>
      {worksheets.map((ws) => (
        <section key={ws} className="rk-wb-sheet">
          <h3>{ws}</h3>
          {cells
            .filter((c) => c.worksheet === ws)
            .map((cell) => {
              const subject = results?.get(cell.id);
              const verdict: CellVerdict = subject?.verdict ?? 'untested';
              return (
                <div key={cell.id} className="rk-wb-card">
                  <div className="rk-wb-card-top">
                    {onInspect !== undefined ? (
                      <button type="button" className="rk-wb-name rk-wb-name--link" onClick={() => onInspect(cell.id)}>
                        {cell.cell}
                      </button>
                    ) : (
                      <span className="rk-wb-name">{cell.cell}</span>
                    )}
                    <span className={`rk-verdict ${VERDICT_CLASS[verdict]}`}>{verdict}</span>
                  </div>
                  {cell.doc !== '' && <div className="rk-wb-doc">{cell.doc}</div>}
                  <div className="rk-wb-value">{preview(valueOf(cell.id))}</div>
                  {(grouped.get(cell.id) ?? []).map((t) => {
                    const outcome = subject?.outcomes.find((o) => o.id === t.id);
                    return (
                      <div key={t.id} className={`rk-wb-test ${outcome?.pass === false ? 'rk-wb-test--fail' : 'rk-wb-test--pass'}`}>
                        <span className="rk-wb-kind">{t.kind}</span>
                        <span className="rk-wb-test-name">{t.name}</span>
                        <span className="rk-wb-outcome">
                          {outcome === undefined ? '' : outcome.pass ? 'pass' : 'fail'}
                        </span>
                        {outcome !== undefined && !outcome.pass && outcome.message !== '' && (
                          <div className="rk-wb-test-msg">{outcome.message}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </section>
      ))}
    </>
  );
}

export default WorkbookPanelBody;
