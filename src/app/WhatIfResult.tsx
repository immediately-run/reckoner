// The what-if readout — pure presentation of a ShadowOutcome for one inspected cell
// (WHATIF_SHADOW_EVALUATION_SPEC §1.1): refusals as typed messages, the baseline→shadow
// value line with the pinned-baseline provenance, the downstream delta list scoped by the
// dependents closure, flipped verdicts, and cross-reference diagnostics. Kept free of
// effects so it renders under `react-dom/server` in tests, like WorkbookPanelBody.
import type { Value } from '../stdlib/types.ts';
import type { ShadowOutcome } from './whatif.ts';
import type { ValueDelta } from '../engine/shadow.ts';
import './workbook-panel.css';

function preview(value: Value | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  const json = JSON.stringify(value);
  return json === undefined ? '—' : json.length > 72 ? `${json.slice(0, 72)}…` : json;
}

function deltaLine(d: ValueDelta): string {
  if (d.kind === 'changed') return `${preview(d.before)} → ${preview(d.after)}`;
  if (d.kind === 'new-error') return `${preview(d.before)} → error: ${d.afterError ?? ''}`;
  if (d.kind === 'error-cleared') return `error cleared → ${preview(d.after)}`;
  return `error: ${d.beforeError ?? ''} → ${d.afterError ?? ''}`;
}

interface WhatIfResultProps {
  outcome: ShadowOutcome;
  /** The inspected cell — its own line renders first, the rest of the closure after. */
  cellId: string;
}

function WhatIfResult({ outcome, cellId }: WhatIfResultProps) {
  if (!outcome.ok) {
    return (
      <div className="rk-wi-refusal" role="status">
        <span className="rk-wb-kind">{outcome.refusal.code}</span> {outcome.refusal.message}
      </div>
    );
  }

  const own = outcome.deltas.find((d) => d.id === cellId);
  const rest = outcome.deltas.filter((d) => d.id !== cellId);
  const baseOwn = outcome.baseline.results.get(cellId)?.value;
  const shadowOwnError = outcome.errorOf(cellId);
  const errorDiags = outcome.diagnostics.filter((d) => d.severity === 'error');

  return (
    <div className="rk-wi-result">
      <div className="rk-wi-line">
        <span className="rk-ins-label">this cell</span>
        <span className="rk-wi-values">
          {shadowOwnError !== undefined
            ? `${preview(baseOwn)} → error: ${shadowOwnError}`
            : own !== undefined
              ? deltaLine(own)
              : `${preview(baseOwn)} (unchanged)`}
        </span>
      </div>

      {rest.length > 0 && (
        <div className="rk-wi-line">
          <span className="rk-ins-label">downstream</span>
          <div className="rk-wi-deltas">
            {rest.map((d) => (
              <div key={d.id} className="rk-wi-delta">
                <span className="rk-wb-name">{d.id}</span>
                <span className="rk-wi-values">{deltaLine(d)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {rest.length === 0 && own !== undefined && (
        <div className="rk-wi-note">no other cell changed.</div>
      )}
      {own === undefined && shadowOwnError === undefined && outcome.deltas.length === 0 && (
        <div className="rk-wi-note">no change against the baseline.</div>
      )}

      {outcome.verdictFlips.length > 0 && (
        <div className="rk-wi-line">
          <span className="rk-ins-label">verdicts</span>
          <div className="rk-wi-deltas">
            {outcome.verdictFlips.map((f) => (
              <div key={f.subject} className="rk-wi-delta">
                <span className="rk-wb-name">{f.subject}</span>
                <span className="rk-wi-values">
                  {f.before} → {f.after}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {errorDiags.length > 0 && (
        <div className="rk-wi-line">
          <span className="rk-ins-label">references</span>
          <div className="rk-wi-deltas">
            {errorDiags.map((d, i) => (
              <div key={i} className="rk-wb-error">
                {d.message}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rk-wi-note">baseline pinned when this run started — the live report may have advanced since.</div>
    </div>
  );
}

export default WhatIfResult;
