// The vocabulary section's rendered form (DOCUMENT_NAVIGATOR_SPEC Part A, G-DN-A5).
// Static render: SSR runs no effects, so this also proves the section pulls in nothing
// that needs a host transport — the module-load hazard the SDK's task module carries
// and that a static import would white-screen `vite dev` with (spec §4.1, DN-R5).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import VocabularySection from './VocabularySection.tsx';
import { componentNames } from '../report/catalog.ts';

describe('VocabularySection', () => {
  const html = renderToStaticMarkup(createElement(VocabularySection));

  it('renders every catalog entry with its snippet and a copy affordance', () => {
    for (const name of componentNames) expect(html).toContain(name);
    expect(html).toContain('Copy');
    expect(html).toContain('input knob'); // widgets are marked
    expect(html).toContain('worksheet.cell'); // a snippet's source placeholder
  });

  it('renders the filter controls', () => {
    expect(html).toContain('all');
    expect(html).toContain('input knobs');
    expect(html).toContain('display');
  });

  it('renders typed attribute lines including per-variant ones', () => {
    expect(html).toContain('required');
    expect(html).toContain('when kind=');
  });
});
