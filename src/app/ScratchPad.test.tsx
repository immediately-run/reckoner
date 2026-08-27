// The scratch pad's static states (WHATIF_SHADOW_EVALUATION_SPEC §1.2): the G-WIF-8
// collision disable and the idle editor with its text-safety affordances. Static-rendered
// (SSR runs no effects, so the shadow runner stays inert); run/refusal behavior is covered
// by the whatif engine tests, and the readout by WhatIfResult.test.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ScratchPad from './ScratchPad.tsx';
import type { ReportSession } from './reportSession.ts';

// The pad touches only `session.sources` before a run — a stub session is enough for SSR.
function sessionWith(sources: Record<string, string>): ReportSession {
  return { sources } as unknown as ReportSession;
}

describe('ScratchPad', () => {
  it('disables itself with a visible message when the document declares a scratch worksheet (G-WIF-8)', () => {
    const html = renderToStaticMarkup(
      createElement(ScratchPad, {
        session: sessionWith({ scratch: '// taken', model: '' }),
        baseVerdicts: null,
        text: '',
        onTextChange: () => {},
      }),
    );
    expect(html).toContain('scratch pad is unavailable');
    expect(html).not.toContain('textarea');
  });

  it('renders the editor with Run, Copy, and Clear on a scratch-free document', () => {
    const html = renderToStaticMarkup(
      createElement(ScratchPad, {
        session: sessionWith({ model: '' }),
        baseVerdicts: null,
        text: 'export const probe = cell({ doc: "p", formula: () => 1 });',
        onTextChange: () => {},
      }),
    );
    expect(html).toContain('textarea');
    expect(html).toContain('Run');
    expect(html).toContain('Copy');
    expect(html).toContain('Clear');
    expect(html).toContain('unsaved');
    expect(html).toContain('never saved to the document');
  });
});
