import { describe, it, expect } from 'vitest';
import { loadDocument } from './loader.ts';
import type { DocumentReader } from './types.ts';

/** In-memory document reader over a flat path → content map. */
function memReader(files: Record<string, string>): DocumentReader {
  return {
    async readFile(path: string): Promise<string> {
      if (path in files) return files[path];
      throw new Error(`ENOENT: ${path}`);
    },
    async readDir(dir: string): Promise<string[]> {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      const names = new Set<string>();
      for (const p of Object.keys(files)) {
        if (p.startsWith(prefix)) names.add(p.slice(prefix.length).split('/')[0]);
      }
      if (names.size === 0) throw new Error(`ENOTDIR: ${dir}`);
      return [...names];
    },
  };
}

const base: Record<string, string> = {
  '/doc/reckoner.json': JSON.stringify({
    format: 1,
    compat: { stdlib: '>=1.0 <2', catalog: '>=1.0 <2', tierTag: 1 },
    worksheets: ['revenue.sheet.js', 'churn.sheet.js'],
    params: { region: 'all' },
    title: 'Meridian weekly',
  }),
  '/doc/worksheets/revenue.sheet.js': 'export const by_month = cell({ /* ... */ });',
  '/doc/worksheets/churn.sheet.js': 'export const by_cohort = cell({ /* ... */ });',
  '/doc/feeds/orders.feed.json': JSON.stringify({
    source: 'https://api.example.com/orders',
    mode: 'poll',
    auth: { secretRef: 'secrets/orders' },
  }),
  '/doc/fixtures/orders.2026-06.frame.json': JSON.stringify({
    rows: [{ month: '2026-06', amount: 100 }],
    provenance: { sourceFeed: 'orders', capturedAt: '2026-07-01T00:00:00Z' },
    tier: 'M2',
  }),
  '/doc/templates/weekly.mdx': '# Weekly revenue.\n<Kpi source="revenue.total" />',
};

describe('loadDocument — a well-formed document', () => {
  it('loads the manifest, ordered worksheets, and each file kind with no diagnostics', async () => {
    const doc = await loadDocument(memReader(base), '/doc');
    expect(doc.manifest.title).toBe('Meridian weekly');
    expect(doc.worksheets.map((w) => w.name)).toEqual(['revenue', 'churn']); // manifest order preserved
    expect(doc.worksheets[0].source).toContain('by_month');
    expect(doc.templates.map((t) => t.name)).toEqual(['weekly']);
    expect(doc.feeds[0].config.auth?.secretRef).toBe('secrets/orders');
    expect(doc.fixtures[0].frame.rows).toHaveLength(1);
    expect(doc.diagnostics).toEqual([]);
  });

  it('missing optional dirs are empty, not errors', async () => {
    const minimal = {
      '/doc/reckoner.json': JSON.stringify({ format: 1, worksheets: ['a.sheet.js'], params: {} }),
      '/doc/worksheets/a.sheet.js': '// a',
    };
    const doc = await loadDocument(memReader(minimal), '/doc');
    expect(doc.feeds).toEqual([]);
    expect(doc.templates).toEqual([]);
    expect(doc.fixtures).toEqual([]);
    expect(doc.diagnostics).toEqual([]);
  });
});

describe('loadDocument — degradation', () => {
  it('a malformed feed becomes a diagnostic; the rest of the document still loads', async () => {
    const files = {
      ...base,
      '/doc/feeds/broken.feed.json': JSON.stringify({ mode: 'poll' }), // no source
    };
    const doc = await loadDocument(memReader(files), '/doc');
    expect(doc.feeds.map((f) => f.name)).toEqual(['orders']); // the good one loaded
    const err = doc.diagnostics.find((d) => d.file === 'feeds/broken.feed.json');
    expect(err?.severity).toBe('error');
    expect(err?.message).toMatch(/source/);
  });

  it('a declared-but-missing worksheet is an error diagnostic', async () => {
    const files = {
      ...base,
      '/doc/reckoner.json': JSON.stringify({
        format: 1,
        worksheets: ['revenue.sheet.js', 'ghost.sheet.js'],
        params: {},
      }),
    };
    const doc = await loadDocument(memReader(files), '/doc');
    expect(doc.worksheets.map((w) => w.name)).toEqual(['revenue']);
    expect(doc.diagnostics.some((d) => d.file === 'worksheets/ghost.sheet.js' && d.severity === 'error')).toBe(true);
  });

  it('a missing manifest is fatal', async () => {
    await expect(loadDocument(memReader({}), '/doc')).rejects.toThrow();
  });

  it('warns when the document declares no worksheets', async () => {
    const files = { '/doc/reckoner.json': JSON.stringify({ format: 1, worksheets: [], params: {} }) };
    const doc = await loadDocument(memReader(files), '/doc');
    expect(doc.diagnostics.some((d) => d.severity === 'warning' && /no worksheets/.test(d.message))).toBe(true);
  });
});
