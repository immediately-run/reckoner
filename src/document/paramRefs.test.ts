// paramRefs (R3-377 — assumptions-as-params): resolution, referential diagnostics, and
// the structural-sharing shadow. The integration with a real document + engine lives in
// calderaCaseStudy.test.ts (the tax-rate flip against Python truth).

import { describe, it, expect } from 'vitest';
import { resolveParamRefs, paramShadow, getPath, setPath } from './paramRefs.ts';
import { parseManifest } from './manifest.ts';
import { loadDocument } from './loader.ts';
import { memoryReader } from '../app/memoryReader.ts';
import type { FixtureFile } from './types.ts';
import type { Value } from '../stdlib/types.ts';

const fixtures: FixtureFile[] = [
  {
    name: 'assumptions',
    path: 'fixtures/assumptions.frame.json',
    frame: { rows: [{ tax_rate: 0.25, sweep: 0.75, label: 'base' }], provenance: {}, tier: 'static' },
  },
];

describe('resolveParamRefs', () => {
  it('resolves defaults from the referenced leaves and records the refs', () => {
    const { defaults, refs, diagnostics } = resolveParamRefs(
      {
        tax_rate: { from: 'fixtures.assumptions', path: '0.tax_rate' },
        sweep: { from: 'assumptions', path: '0.sweep' }, // bare fixture name also accepted
      },
      fixtures,
    );
    expect(diagnostics).toEqual([]);
    expect(defaults['params.tax_rate']).toEqual({ value: 0.25, tier: 'static' });
    expect(defaults['params.sweep']).toEqual({ value: 0.75, tier: 'static' });
    expect(refs.tax_rate).toEqual({ from: 'fixtures.assumptions', path: '0.tax_rate' });
  });

  it('an unknown fixture and an unresolvable path each produce a diagnostic naming the key', () => {
    const { diagnostics } = resolveParamRefs(
      {
        ghost: { from: 'fixtures.no_such', path: '0.x' },
        bad_path: { from: 'fixtures.assumptions', path: '9.tax_rate' },
        also_bad: { from: 'fixtures.assumptions', path: '0.nope' },
      },
      fixtures,
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      'paramRefs.ghost: "fixtures.no_such" names no loaded fixture.',
      'paramRefs.bad_path: path "9.tax_rate" resolves to nothing inside "fixtures.assumptions".',
      'paramRefs.also_bad: path "0.nope" resolves to nothing inside "fixtures.assumptions".',
    ]);
  });
});

describe('getPath / setPath', () => {
  it('roundtrips a dotted path through arrays and objects', () => {
    const v: Value = [{ a: { b: 1 } }, { a: { b: 2 } }];
    expect(getPath(v, '1.a.b')).toBe(2);
    expect(getPath(setPath(v, '1.a.b', 99), '1.a.b')).toBe(99);
  });

  it('setPath is structurally shared: the original is untouched, untouched siblings keep identity', () => {
    const row0 = { tax_rate: 0.25, sweep: 0.75 };
    const v: Value = [row0, { tax_rate: 0.3, sweep: 0.6 }];
    const out = setPath(v, '0.tax_rate', 0.3) as typeof v;
    expect(row0.tax_rate).toBe(0.25); // the original fixture value is NOT mutated
    expect(out[1]).toBe(v[1]); // untouched sibling keeps identity (sharing)
    const outRow = out[0] as { tax_rate: number };
    expect(outRow).not.toBe(row0);
    expect(outRow.tax_rate).toBe(0.3);
  });

  it('getPath resolves to undefined, never throws, on shapes that do not fit', () => {
    expect(getPath(5, 'a')).toBeUndefined();
    expect(getPath([1], 'x')).toBeUndefined();
    expect(getPath([{ a: 1 }], 'a.b')).toBeUndefined();
    expect(getPath(null, 'a')).toBeUndefined();
  });
});

describe('paramShadow', () => {
  it('patches both params.<name> and the shadowed fixture leaf', () => {
    const fixtureValue: Value = [{ tax_rate: 0.25 }];
    const patch = paramShadow('tax_rate', 0.3, { from: 'fixtures.assumptions', path: '0.tax_rate' }, fixtureValue);
    expect(Object.keys(patch).sort()).toEqual(['fixtures.assumptions', 'params.tax_rate']);
    expect(patch['params.tax_rate']).toEqual({ value: 0.3 });
    expect((patch['fixtures.assumptions'].value as { tax_rate: number }[])[0].tax_rate).toBe(0.3);
  });
});

describe('manifest + loader integration', () => {
  const MANIFEST = (refs: unknown): string =>
    JSON.stringify({ format: 1, compat: { stdlib: '>=0.1.0', catalog: '>=0.1.0' }, worksheets: ['s'], paramRefs: refs });
  const WORKSHEET = 'import { cell } from "@reckoner/stdlib";\nexport const x = cell({ doc: "d", inputs: {}, formula: () => 1 });';
  const FIXTURE = JSON.stringify({ rows: [{ tax_rate: 0.25 }], provenance: { synthetic: true } });

  function files(refs: unknown): Record<string, string> {
    return {
      'cal/reckoner.json': MANIFEST(refs),
      'cal/worksheets/s.sheet.js': WORKSHEET,
      'cal/fixtures/assumptions.frame.json': FIXTURE,
    };
  }

  it('parses well-formed paramRefs', () => {
    const m = parseManifest(JSON.parse(MANIFEST({ tax_rate: { from: 'fixtures.assumptions', path: '0.tax_rate' } })));
    expect(m.paramRefs).toEqual({ tax_rate: { from: 'fixtures.assumptions', path: '0.tax_rate' } });
  });

  it('rejects malformed paramRefs at parse time (shape is fatal)', () => {
    expect(() => parseManifest(JSON.parse(MANIFEST({ bad: { from: 'x' } })))).toThrow(/paramRefs.bad/);
    expect(() => parseManifest(JSON.parse(MANIFEST([1])))).toThrow(/paramRefs.*object/);
  });

  it('a broken ref surfaces as a load diagnostic naming the key, not a load failure', async () => {
    const loaded = await loadDocument(memoryReader(files({ ghost: { from: 'fixtures.nope', path: '0.x' } })), 'cal');
    expect(loaded.diagnostics.map((d) => d.message)).toEqual([
      'paramRefs.ghost: "fixtures.nope" names no loaded fixture.',
    ]);
  });

  it('a valid ref loads clean', async () => {
    const loaded = await loadDocument(memoryReader(files({ tax_rate: { from: 'fixtures.assumptions', path: '0.tax_rate' } })), 'cal');
    expect(loaded.diagnostics).toEqual([]);
  });
});
