// The vocabulary section (DOCUMENT_NAVIGATOR_SPEC Part A §1) — panel chrome answering
// "what components exist, and what can I use as an input knob?". Everything rendered is
// derived from the closed catalog by `vocabulary()`; this file is presentation plus a
// filter and a copy affordance. Each entry collapses (the large-catalog + mobile
// pattern the author's-view indexes use) and carries a snippet the suite has already
// proven parses and validates (G-DN-A3), so the copy button hands over something usable
// rather than an example that errors on paste.
import { useState } from 'react';
import { vocabulary } from './vocabulary.ts';
import type { VocabAttribute, VocabFilter } from './vocabulary.ts';
import './workbook-panel.css';

const FILTERS: { value: VocabFilter; label: string }[] = [
  { value: undefined, label: 'all' },
  { value: 'widgets', label: 'input knobs' },
  { value: 'components', label: 'display' },
];

function attrLine(a: VocabAttribute): string {
  const req = a.required ? ' · required' : '';
  const values = a.values !== undefined && a.values.length > 0 ? ` · ${a.values.join(' | ')}` : '';
  const variant = a.variant !== undefined ? ` · when kind="${a.variant}"` : '';
  return `${a.name} · ${a.type}${req}${values}${variant}`;
}

function VocabularySection() {
  const [filter, setFilter] = useState<VocabFilter>(undefined);
  const [copied, setCopied] = useState<string | null>(null);
  const entries = vocabulary(filter);

  const copy = (name: string, snippet: string): void => {
    try {
      void navigator.clipboard?.writeText(snippet).then(() => {
        setCopied(name);
        setTimeout(() => setCopied(null), 1500);
      });
    } catch {
      /* clipboard can be absent in the sandboxed iframe — the snippet is selectable text */
    }
  };

  return (
    <section className="rk-wb-sheet rk-vocab" aria-label="Vocabulary">
      <h3>vocabulary</h3>
      <div className="rk-wb-note">
        the components a template can use — copy a snippet, paste it into the template file.
      </div>
      <div className="rk-wi-actions" role="group" aria-label="Vocabulary filter">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            className={`rk-wb-close ${filter === f.value ? 'rk-vocab-filter--on' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {entries.map((entry) => (
        <details key={entry.name} className="rk-refl-sheet rk-vocab-entry">
          <summary className="rk-refl-sheet-name">
            {entry.name}
            {entry.isWidget && <span className="rk-scratch-tag">input knob</span>}
            {entry.isContainer && <span className="rk-scratch-tag">container</span>}
          </summary>

          <div className="rk-vocab-attrs">
            {entry.attributes.length === 0 && <span className="rk-refl-plain">no attributes</span>}
            {entry.attributes.map((a) => (
              <div key={`${a.variant ?? ''}${a.name}`} className="rk-refl-plain">
                {attrLine(a)}
              </div>
            ))}
          </div>

          {entry.snippet !== null ? (
            <>
              <pre className="rk-refl-formula">{entry.snippet}</pre>
              <div className="rk-wi-actions">
                <button type="button" className="rk-wb-close" onClick={() => copy(entry.name, entry.snippet!)}>
                  {copied === entry.name ? 'Copied' : 'Copy'}
                </button>
              </div>
            </>
          ) : (
            <div className="rk-wb-note">{entry.snippetNote ?? 'no snippet available.'}</div>
          )}
        </details>
      ))}
    </section>
  );
}

export default VocabularySection;
