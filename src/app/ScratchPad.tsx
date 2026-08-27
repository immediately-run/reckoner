// The scratch pad (WHATIF_SHADOW_EVALUATION_SPEC §1.2) — the R-6 ephemeral scratch
// surface: one unsaved worksheet buffer with the full worksheet grammar, run through the
// shadow session and rendered as ordinary workbook cards, visibly marked unsaved. Text
// safety per §1.4: the buffer is session-scoped app state (survives panel close), Clear
// is an arm-then-confirm (the in-repo confirm idiom — no native dialogs), and Copy offers
// the text to the clipboard with a guarded fallback (a plain textarea always allows
// manual select-copy). Refusals (scratch collision G-WIF-8, durable-subject tests
// G-WIF-6a), build errors, and cross-reference diagnostics (G-WIF-10) render as visible
// messages, never silent.
import { useState } from 'react';
import type { SubjectResult } from '../engine/worker/protocol.ts';
import { SCRATCH_WORKSHEET } from '../engine/shadow.ts';
import { useShadowRunner } from '../hooks/useShadowRunner.ts';
import type { ReportSession } from './reportSession.ts';
import WorkbookPanelBody from './WorkbookPanelBody.tsx';
import './workbook-panel.css';

interface ScratchPadProps {
  session: ReportSession;
  /** The panel's current suite results (verdict flips for scratch subjects diff against these). */
  baseVerdicts: ReadonlyMap<string, SubjectResult> | null;
  /** The session-scoped buffer text (App owns it; §1.4). */
  text: string;
  onTextChange: (text: string) => void;
}

function ScratchPad({ session, baseVerdicts, text, onTextChange }: ScratchPadProps) {
  const { outcome, running, run, reset } = useShadowRunner(session);
  const [armedClear, setArmedClear] = useState(false);
  const [copied, setCopied] = useState(false);

  // G-WIF-8: a document that declares its own `scratch` worksheet disables the pad.
  if (SCRATCH_WORKSHEET in session.sources) {
    return (
      <section className="rk-wb-sheet rk-scratch">
        <h3>scratch</h3>
        <div className="rk-wb-note">
          this document already has a worksheet named “{SCRATCH_WORKSHEET}”, so the scratch pad is unavailable here.
        </div>
      </section>
    );
  }

  const copy = (): void => {
    try {
      void navigator.clipboard?.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } catch {
      /* clipboard can be absent in the sandboxed iframe — the textarea still selects */
    }
  };

  const scratchCells = outcome?.ok === true ? outcome.cells.filter((c) => c.worksheet === SCRATCH_WORKSHEET) : [];
  const scratchTests = outcome?.ok === true ? outcome.tests.filter((t) => t.worksheet === SCRATCH_WORKSHEET) : [];
  const scratchErrors =
    outcome?.ok === true
      ? scratchCells.map((c) => ({ id: c.id, error: outcome.errorOf(c.id) })).filter((e) => e.error !== undefined)
      : [];
  const errorDiags = outcome?.ok === true ? outcome.diagnostics.filter((d) => d.severity === 'error') : [];

  return (
    <section className="rk-wb-sheet rk-scratch" aria-label="Scratch pad">
      <h3>
        scratch <span className="rk-scratch-tag">unsaved</span>
      </h3>
      <div className="rk-wb-note">
        an ephemeral worksheet: cells, tests, cross-references — evaluated on demand, never saved to the document.
      </div>
      <textarea
        className="rk-wi-editor rk-scratch-editor"
        value={text}
        rows={Math.min(14, Math.max(5, text.split('\n').length))}
        spellCheck={false}
        aria-label="Scratch worksheet source"
        placeholder={`import { cell } from "@reckoner/stdlib";\n\nexport const probe = cell({\n  doc: "try something",\n  inputs: { },\n  formula: () => 1,\n});`}
        onChange={(e) => {
          setArmedClear(false);
          onTextChange(e.target.value);
        }}
      />
      <div className="rk-wi-actions">
        <button
          type="button"
          className="rk-wb-run"
          onClick={() => run({ scratch: text }, baseVerdicts)}
          disabled={running || text.trim() === ''}
        >
          {running ? 'Running…' : 'Run'}
        </button>
        <button type="button" className="rk-wb-close" onClick={copy} disabled={text === ''}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        {!armedClear ? (
          <button type="button" className="rk-wb-close" onClick={() => setArmedClear(true)} disabled={running || text === ''}>
            Clear
          </button>
        ) : (
          <button
            type="button"
            className="rk-wb-close rk-scratch-clear-armed"
            onClick={() => {
              setArmedClear(false);
              onTextChange('');
              reset();
            }}
          >
            Really clear?
          </button>
        )}
      </div>

      {outcome !== null && !outcome.ok && (
        <div className="rk-wb-error" role="status">
          <span className="rk-wb-kind">{outcome.refusal.code}</span> {outcome.refusal.message}
        </div>
      )}
      {errorDiags.map((d, i) => (
        <div key={i} className="rk-wb-error">
          {d.message}
        </div>
      ))}
      {scratchErrors.map((e) => (
        <div key={e.id} className="rk-wb-error">
          {e.id}: {e.error}
        </div>
      ))}

      {outcome?.ok === true && scratchCells.length > 0 && (
        <WorkbookPanelBody
          cells={scratchCells}
          tests={scratchTests}
          results={outcome.verdicts}
          valueOf={outcome.valueOf}
        />
      )}
    </section>
  );
}

export default ScratchPad;
