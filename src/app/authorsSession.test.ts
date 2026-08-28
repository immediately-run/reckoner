// The author's view through the real session pipeline (AUTHORS_VIEW_SPEC §3.5/§4,
// gates G-AV-1..4 session halves + the §6 consumer-template diagnostic): in-memory
// documents through `buildReportSession` over the in-process transport.
import { describe, expect, it } from 'vitest';
import { inMemoryTransport } from '../engine/workerTransport.ts';
import type { SeedDocument } from '../seed/seeds.ts';
import { buildReportSession } from './reportSession.ts';

const SHEET = `import { cell } from "@reckoner/stdlib";

export const total = cell({
  doc: "the number",
  inputs: {},
  formula: () => 41,
});
`;

function seed(over: {
  manifest?: Record<string, unknown>;
  templates?: Record<string, string>;
}): SeedDocument {
  const files: Record<string, string> = {
    '/doc/reckoner.json': JSON.stringify({
      format: 1,
      compat: { stdlib: '>=0.1.0', catalog: '>=0.1.0' },
      worksheets: ['model.sheet.js'],
      params: {},
      title: 'Authors harness',
      ...(over.manifest ?? {}),
    }),
    '/doc/worksheets/model.sheet.js': SHEET,
  };
  for (const [name, source] of Object.entries(over.templates ?? {})) {
    files[`/doc/templates/${name}.mdx`] = source;
  }
  return { root: '/doc', files, demoFeed: false };
}

describe('author’s-view session wiring', () => {
  it('G-AV-1: a document without an author’s view gets the built-in scaffold', async () => {
    const session = await buildReportSession(inMemoryTransport(), seed({ templates: { weekly: '# Report.\n' } }));
    expect(session.authorsFromDocument).toBe(false);
    expect(session.authorsNodes.some((n) => n.type === 'component' && n.name === 'FormulaIndex')).toBe(true);
    expect(session.nodes.length).toBeGreaterThan(0); // the consumer report is weekly
  });

  it('G-AV-2: the document’s own authors_view.mdx replaces the default entirely', async () => {
    const session = await buildReportSession(
      inMemoryTransport(),
      seed({ templates: { weekly: '# Report.\n', authors_view: '# Mine.\n\n<SuiteSummary />\n' } }),
    );
    expect(session.authorsFromDocument).toBe(true);
    expect(session.authorsNodes.some((n) => n.type === 'component' && n.name === 'FormulaIndex')).toBe(false);
    expect(session.authorsNodes.some((n) => n.type === 'component' && n.name === 'SuiteSummary')).toBe(true);
  });

  it('G-AV-3: the author’s view never serves as the consumer report', async () => {
    // Template list [authors_view, deal] — the report must be deal, not the workings.
    const withOther = await buildReportSession(
      inMemoryTransport(),
      seed({ templates: { authors_view: '<FormulaIndex />\n', deal: '# Deal.\n' } }),
    );
    expect(withOther.nodes.some((n) => n.type === 'markdown' && n.text.includes('Deal'))).toBe(true);

    // A document with ONLY an author's view renders the report empty-state.
    const only = await buildReportSession(
      inMemoryTransport(),
      seed({ templates: { authors_view: '<FormulaIndex />\n' } }),
    );
    expect(only.nodes).toEqual([]);
    expect(only.authorsFromDocument).toBe(true);
  });

  it('G-AV-4: the manifest’s authorsView key selects a differently-named template', async () => {
    const session = await buildReportSession(
      inMemoryTransport(),
      seed({
        manifest: { authorsView: 'workings' },
        templates: { workings: '# Workings.\n\n<TestIndex />\n', weekly: '# Report.\n' },
      }),
    );
    expect(session.authorsFromDocument).toBe(true);
    expect(session.authorsNodes.some((n) => n.type === 'component' && n.name === 'TestIndex')).toBe(true);
    expect(session.nodes.some((n) => n.type === 'markdown' && n.text.includes('Report'))).toBe(true);
  });

  it('§6: a reflection component in a consumer template raises a load-time warning', async () => {
    const session = await buildReportSession(
      inMemoryTransport(),
      seed({ templates: { weekly: '# Report.\n\n<FormulaIndex />\n' } }),
    );
    const warning = session.diagnostics.find((d) => d.message.includes('FormulaIndex'));
    expect(warning).toBeDefined();
    expect(warning?.severity).toBe('warning');
    // …and the author's-view scaffold itself never triggers it.
    expect(session.diagnostics.filter((d) => d.message.includes("author's-view component")).length).toBe(1);
  });
});
