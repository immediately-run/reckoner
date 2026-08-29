// The authoring vocabulary (DOCUMENT_NAVIGATOR_SPEC Part A, gates G-DN-A1…A4). The
// load-bearing one is G-DN-A3: every generated snippet goes through the REAL parser and
// validator, so a snippet that could never validate fails the suite instead of shipping
// as a broken example — the falsifiable form of "usable" the adversarial pass demanded
// in place of the draft's "a starting point, not a promise of validity" hedge.
import { describe, expect, it } from 'vitest';
import { WIDGETS, componentNames } from '../report/catalog.ts';
import { parseTemplate } from '../report/parse/mdx.ts';
import { validateTemplate } from '../report/validate.ts';
import { vocabulary } from './vocabulary.ts';

describe('vocabulary — derived from the catalog (G-DN-A1)', () => {
  it('enumerates every catalog entry, with no hand-written list', () => {
    expect(vocabulary().map((e) => e.name).sort()).toEqual([...componentNames].sort());
  });

  it('marks widgets and containers (G-DN-A2)', () => {
    const entries = vocabulary();
    const byName = new Map(entries.map((e) => [e.name, e]));
    for (const name of WIDGETS) expect(byName.get(name)?.isWidget).toBe(true);
    expect(byName.get('Kpi')?.isWidget).toBe(false);
    expect(byName.get('Params')?.isContainer).toBe(true);
    expect(byName.get('Kpi')?.isContainer).toBe(false);
  });

  it('carries per-variant attributes, variant-labelled, plus the discriminator (G-DN-A2)', () => {
    const chart = vocabulary().find((e) => e.name === 'Chart');
    expect(chart?.variantValues).toContain('bar');
    const kind = chart?.attributes.find((a) => a.name === 'kind');
    expect(kind).toMatchObject({ required: true, type: 'enum' });
    expect(kind?.values).toContain('histogram');
    // `x` is required only within the variants that declare it.
    const barX = chart?.attributes.find((a) => a.name === 'x' && a.variant === 'bar');
    expect(barX).toMatchObject({ required: true, variant: 'bar' });
    // A histogram declares `value`, not `x` — the per-variant split is preserved.
    expect(chart?.attributes.some((a) => a.variant === 'histogram' && a.name === 'value')).toBe(true);
  });

  it('filters: widgets, their complement, and everything (G-DN-A4)', () => {
    expect(vocabulary('widgets').map((e) => e.name).sort()).toEqual([...WIDGETS].sort());
    const components = vocabulary('components').map((e) => e.name);
    expect(components.some((n) => WIDGETS.has(n))).toBe(false);
    expect(components.length + WIDGETS.size).toBe(componentNames.length);
    expect(vocabulary().length).toBe(componentNames.length);
  });
});

describe('every snippet parses and validates (G-DN-A3)', () => {
  for (const entry of vocabulary()) {
    it(`${entry.name} — zero error diagnostics`, () => {
      expect(entry.snippet).not.toBeNull();
      const nodes = parseTemplate(entry.snippet!);
      // It must actually parse to the component it documents, not to prose.
      expect(nodes.some((n) => n.type === 'component' && n.name === entry.name)).toBe(true);
      const errors = validateTemplate(nodes).diagnostics.filter((d) => d.severity === 'error');
      expect(errors, `${entry.name}: ${errors.map((d) => d.message).join('; ')}`).toEqual([]);
    });
  }
});
