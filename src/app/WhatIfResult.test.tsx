// The what-if readout's states (WHATIF_SHADOW_EVALUATION_SPEC §1.1): typed refusals, the
// baseline→shadow line, the downstream delta list, verdict flips, xref diagnostics, and
// the pinned-baseline provenance note. Static-rendered against a hand-built outcome; the
// effect-owning shell (WhatIfPanel/useShadowRunner) is covered by the whatif engine tests.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WhatIfResult from './WhatIfResult.tsx';
import type { ShadowOutcome, ShadowSuccess } from './whatif.ts';
import type { AsyncPass } from '../engine/asyncEngine.ts';
import { contentKey } from '../engine/hash.ts';
import type { Value } from '../stdlib/types.ts';

function pass(results: Record<string, Value>, errors: Record<string, string> = {}): AsyncPass {
  return {
    results: new Map(
      Object.entries(results).map(([id, value]) => [id, { id, value, tier: 'static' as const, key: contentKey(value) }]),
    ),
    errors: new Map(Object.entries(errors)),
    quarantined: [],
  };
}

// `valueOf` is omitted from the override shape: an object literal's inherited
// Object.prototype.valueOf would otherwise clash with the field during assignability.
function success(over: Partial<Omit<ShadowSuccess, 'valueOf' | 'errorOf'>>): ShadowOutcome {
  const shadow = over.pass ?? pass({});
  return {
    ok: true,
    baseline: over.baseline ?? pass({}),
    pass: shadow,
    cells: [],
    tests: [],
    verdicts: new Map(),
    deltas: [],
    closure: new Set(),
    verdictFlips: [],
    diagnostics: [],
    valueOf: (id) => shadow.results.get(id)?.value,
    errorOf: (id) => shadow.errors.get(id),
    ...over,
  };
}

describe('WhatIfResult', () => {
  it('renders a typed refusal', () => {
    const html = renderToStaticMarkup(
      createElement(WhatIfResult, {
        outcome: { ok: false, refusal: { code: 'formula-ambiguous', message: 'occurs more than once' } },
        cellId: 'm.a',
      }),
    );
    expect(html).toContain('formula-ambiguous');
    expect(html).toContain('occurs more than once');
  });

  it('renders the baseline→shadow line, the downstream deltas, flips, and provenance', () => {
    const outcome = success({
      baseline: pass({ 'm.a': 6, 'm.b': 12 }),
      pass: pass({ 'm.a': 106, 'm.b': 212 }),
      deltas: [
        { id: 'm.a', kind: 'changed', before: 6, after: 106 },
        { id: 'm.b', kind: 'changed', before: 12, after: 212 },
      ],
      verdictFlips: [{ subject: 'm.b', before: 'pinned', after: 'failing' }],
    });
    const html = renderToStaticMarkup(createElement(WhatIfResult, { outcome, cellId: 'm.a' }));
    expect(html).toContain('6 → 106');
    expect(html).toContain('m.b');
    expect(html).toContain('12 → 212');
    expect(html).toContain('pinned → failing');
    expect(html).toContain('baseline pinned');
  });

  it('renders a shadow error on the inspected cell and xref diagnostics', () => {
    const outcome = success({
      baseline: pass({ 'm.a': 6 }),
      pass: pass({}, { 'm.a': 'boom' }),
      deltas: [{ id: 'm.a', kind: 'new-error', before: 6, afterError: 'boom' }],
      diagnostics: [{ severity: 'error', file: 'worksheets/scratch', message: 'references unknown fixture "rowz".' }],
    });
    const html = renderToStaticMarkup(createElement(WhatIfResult, { outcome, cellId: 'm.a' }));
    expect(html).toContain('error: boom');
    expect(html).toContain('rowz');
  });

  it('says so when nothing changed', () => {
    const outcome = success({ baseline: pass({ 'm.a': 6 }), pass: pass({ 'm.a': 6 }) });
    const html = renderToStaticMarkup(createElement(WhatIfResult, { outcome, cellId: 'm.a' }));
    expect(html).toContain('no change against the baseline');
  });
});
