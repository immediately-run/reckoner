// The value inspector — review surface slice 2 (design brief surface 2, first cut). The
// provenance surface: what this number IS, where it comes from, and how well it is tested —
// binding name, `doc`, read-only formula source, declared-input chips (navigable hop-by-hop:
// the brief's V3 chain pixel → binding → formula → inputs → sources), current value + tier,
// and the coverage state.
//
// Deliberate v1 boundaries, recorded in the handoff: the **tier badge slot is reserved for
// the host** (review-1 H2 — the badge is host-drawn trust chrome; the tier appears here as
// plain data, never as a badge imitation), the **precedent-neighborhood view** (review-1
// UX-4) and the **on-pixel affordance** (V3's hover-reveal / long-press) are follow-ons —
// this slice opens from the workbook panel's cards. Edit / ask-assistant affordances wait
// for a writable mount (none in the standalone demo).
import type { CellDescriptor, SubjectResult, TestDescriptor } from '../engine/worker/protocol.ts';
import type { PublishedResult } from '../engine/types.ts';
import { precedentTree } from '../engine/precedents.ts';
import { verdictChip } from '../report/render/verdictChip.ts';
import type { Value } from '../stdlib/types.ts';
import PrecedentView from './PrecedentView.tsx';
import './workbook-panel.css';

function preview(value: Value | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  const json = JSON.stringify(value);
  return json === undefined ? '—' : json.length > 160 ? `${json.slice(0, 160)}…` : json;
}

interface ValueInspectorProps {
  cell: CellDescriptor;
  /** Every cell of the workbook (the precedent neighborhood's substrate). */
  cells: readonly CellDescriptor[];
  /** Every test targeting this cell (filtered by subject by the caller). */
  tests: readonly TestDescriptor[];
  /** The app-level suite results — `null` while the suites are still computing, which
   *  renders the distinct `pending` chip (never a premature `untested`); a cell absent
   *  from the settled map is the computed `untested`. */
  verdicts: ReadonlyMap<string, SubjectResult> | null;
  /** The published result (value + tier). */
  result: PublishedResult | undefined;
  /** Navigate to another cell (an input chip) — the hop-by-hop V3 walk. */
  onNavigate: (cellId: string) => void;
  onClose: () => void;
  /**
   * Open the what-if editor for this cell (WHATIF_SHADOW_EVALUATION_SPEC §1.1, amended
   * 2026-08-28): the counterfactual section is collapsed by default, and this affordance
   * on the formula row is its door — absent, no what-if chrome renders at all.
   */
  onWhatIf?: () => void;
  /**
   * Worksheet name → document-relative file path (R3-427): with the descriptor spans,
   * the formula row and each test row name their exact `file:line`, so correcting a
   * faulty formula or test by hand starts from a location, not a search. Plain data for
   * now; the clickable open-at-line ride the navigator work + the editor line-hint.
   */
  worksheetPaths?: Record<string, string>;
  /**
   * Part B's edit door (DOCUMENT_NAVIGATOR_SPEC §3/§4, R3-447): the per-row platform
   * editor delegation. `canEditPath` decides, PER ROW, whether the door renders —
   * absent (never disabled) when the mount is not `rw`, the door is latched off, or
   * the path fails the §4.3 gate. `onEdit` opens the platform editor on that file.
   * Both are undefined/absent together in the seed (non-dispatched) flow.
   */
  canEditPath?: (relPath: string) => boolean;
  onEdit?: (relPath: string) => void;
}

/** The RCD §5.1 disclosure, at the button (Grove's dispatch wording): edits land in
 *  the mounted content, and proposing them back to the source repository is not
 *  wired. Rendered once, under the first row that carries a door. */
const EDIT_DISCLOSURE = 'Edits save to the mounted content. Proposing a change back to its repository is not wired yet.';

function ValueInspector({ cell, cells, tests, verdicts, result, onNavigate, onClose, onWhatIf, worksheetPaths, canEditPath, onEdit }: ValueInspectorProps) {
  const fileLine = (worksheet: string, span?: { line: number }): string | null => {
    const path = worksheetPaths?.[worksheet];
    return path !== undefined && span !== undefined ? `${path}:${span.line}` : null;
  };
  const cellAt = fileLine(cell.worksheet, cell.span);
  const outcome = verdicts?.get(cell.id);
  const chip = verdictChip(cell.id, verdicts);
  // The row door (§3): beside the `file:line` anchor, only where the row's own path
  // passes the gate. Absent — not disabled — everywhere else.
  const rowDoor = (worksheet: string): string | null => {
    const path = worksheetPaths?.[worksheet];
    if (path === undefined) return null;
    return canEditPath !== undefined && onEdit !== undefined && canEditPath(path) ? path : null;
  };
  const cellDoor = rowDoor(cell.worksheet);
  return (
    <div className="rk-ins" aria-label={`Inspector for ${cell.id}`}>
      <header className="rk-ins-head">
        <div className="rk-ins-title">
          <span className="rk-wb-name">{cell.id}</span>
          <span className={chip.className}>{chip.label}</span>
        </div>
        <button type="button" className="rk-wb-close" onClick={onClose}>
          Close
        </button>
      </header>

      {cell.doc !== '' && <p className="rk-ins-doc">{cell.doc}</p>}

      <div className="rk-ins-row">
        <span className="rk-ins-label">value</span>
        <span className="rk-ins-value">{preview(result?.value)}</span>
        {/* Plain text, not a badge: the tier badge is host-drawn chrome (review-1 H2) —
            this app supplies the value and reserves the slot, it never draws one. */}
        <span className="rk-ins-tier">tier {result?.tier ?? '—'}</span>
      </div>

      <div className="rk-ins-row">
        <span className="rk-ins-label">inputs</span>
        <div className="rk-ins-chips">
          {cell.resolvers.length === 0 && <span className="rk-ins-none">none declared</span>}
          {cell.resolvers.map((r) => {
            if (r.kind === 'cell') {
              return (
                <button key={r.name} type="button" className="rk-chip rk-chip--nav" onClick={() => onNavigate(r.nodeId)}>
                  {r.name} ← {r.nodeId}
                </button>
              );
            }
            if (r.kind === 'windowed-feed') {
              return (
                <span key={r.name} className="rk-chip">
                  {r.name} ← feed {r.feed} · {r.window}
                </span>
              );
            }
            if (r.kind === 'wildcard') {
              return (
                <span key={r.name} className="rk-chip">
                  {r.name} ← {r.worksheet}.*
                </span>
              );
            }
            return (
              <span key={r.name} className="rk-chip">
                {r.name} ← {r.key}
              </span>
            );
          })}
        </div>
      </div>

      <div className="rk-ins-row">
        <span className="rk-ins-label">
          formula
          {onWhatIf !== undefined && (
            <button type="button" className="rk-chip rk-chip--nav rk-chip--whatif" onClick={onWhatIf}>
              what if →
            </button>
          )}
          {cellAt !== null && <span className="rk-ins-fileline">{cellAt}</span>}
          {cellDoor !== null && (
            <button
              type="button"
              className="rk-chip rk-chip--nav rk-chip--edit"
              title={EDIT_DISCLOSURE}
              onClick={() => onEdit?.(cellDoor)}
            >
              edit
            </button>
          )}
        </span>
        <pre className="rk-ins-formula">{cell.formulaSource}</pre>
      </div>

      {cellDoor !== null && <p className="rk-ins-edit-note">{EDIT_DISCLOSURE}</p>}

      {cell.resolvers.some((r) => r.kind === 'cell' || r.kind === 'wildcard') && (
        <div className="rk-ins-row">
          <span className="rk-ins-label">precedents</span>
          <PrecedentView tree={precedentTree(cell.id, cells)} onNavigate={onNavigate} />
        </div>
      )}

      {tests.length > 0 && (
        <div className="rk-ins-row">
          <span className="rk-ins-label">tests</span>
          <div className="rk-ins-tests">
            {tests.map((t) => {
              const o = outcome?.outcomes.find((x) => x.id === t.id);
              const testAt = fileLine(t.worksheet, t.span);
              const testDoor = rowDoor(t.worksheet);
              return (
                <div key={t.id} className={`rk-wb-test ${o?.pass === false ? 'rk-wb-test--fail' : 'rk-wb-test--pass'}`}>
                  <span className="rk-wb-kind">{t.kind}</span>
                  <span className="rk-wb-test-name">{t.name}</span>
                  <span className="rk-wb-outcome">{o === undefined ? '' : o.pass ? 'pass' : 'fail'}</span>
                  {testAt !== null && <span className="rk-ins-fileline">{testAt}</span>}
                  {testDoor !== null && (
                    <button
                      type="button"
                      className="rk-chip rk-chip--nav rk-chip--edit"
                      title={EDIT_DISCLOSURE}
                      onClick={() => onEdit?.(testDoor)}
                    >
                      edit
                    </button>
                  )}
                  {o !== undefined && !o.pass && o.message !== '' && <div className="rk-wb-test-msg">{o.message}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ValueInspector;
