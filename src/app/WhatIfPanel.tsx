// The inspector's "What if" section (WHATIF_SHADOW_EVALUATION_SPEC §1.1) — the effectful
// shell: an editable formula variant (session-scoped text, owned by App per §1.4 so
// closing the inspector never destroys an edit), an explicit Run through the shadow
// runner, the WhatIfResult readout, and Discard. Ephemeral by construction: no apply, no
// write path (§7 — the document here is read-only, and the spec says the affordance must
// explain itself rather than dangle a dead button).
import { useEffect } from 'react';
import type { CellDescriptor, SubjectResult } from '../engine/worker/protocol.ts';
import { useShadowRunner } from '../hooks/useShadowRunner.ts';
import type { ReportSession } from './reportSession.ts';
import WhatIfResult from './WhatIfResult.tsx';
import './workbook-panel.css';

interface WhatIfPanelProps {
  session: ReportSession;
  cell: CellDescriptor;
  /** The review surface's current suite results — verdict flips diff against these. */
  baseVerdicts: ReadonlyMap<string, SubjectResult> | null;
  /** The session-scoped variant text for this cell (App owns it; §1.4). */
  text: string;
  onTextChange: (cellId: string, text: string) => void;
}

function WhatIfPanel({ session, cell, baseVerdicts, text, onTextChange }: WhatIfPanelProps) {
  const { outcome, running, run, reset } = useShadowRunner(session);

  // A different inspected cell means a different counterfactual: drop the stale readout
  // (the variant text itself is per-cell app state and survives).
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.id]);

  const edited = text !== cell.formulaSource;

  return (
    <div className="rk-wi" aria-label={`What if for ${cell.id}`}>
      <div className="rk-ins-row">
        <span className="rk-ins-label">what if</span>
        <textarea
          className="rk-wi-editor"
          value={text}
          rows={Math.min(10, Math.max(3, text.split('\n').length))}
          spellCheck={false}
          aria-label={`Formula variant for ${cell.id}`}
          onChange={(e) => onTextChange(cell.id, e.target.value)}
        />
        <div className="rk-wi-actions">
          <button type="button" className="rk-wb-run" onClick={() => run({ variants: { [cell.id]: text } }, baseVerdicts)} disabled={running}>
            {running ? 'Running…' : 'Run'}
          </button>
          <button
            type="button"
            className="rk-wb-close"
            onClick={() => {
              reset();
              onTextChange(cell.id, cell.formulaSource);
            }}
            disabled={running || (!edited && outcome === null)}
          >
            Discard
          </button>
        </div>
        {outcome !== null && <WhatIfResult outcome={outcome} cellId={cell.id} />}
        {outcome === null && (
          <div className="rk-wi-note">
            edit the formula and run to see the counterfactual — results are never saved to the document.
          </div>
        )}
      </div>
    </div>
  );
}

export default WhatIfPanel;
