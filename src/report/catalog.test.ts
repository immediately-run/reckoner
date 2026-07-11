import { describe, it, expect } from 'vitest';
import { catalog, componentNames, WIDGETS } from './catalog.ts';

describe('component catalog', () => {
  it('exposes the closed v1 set', () => {
    expect(componentNames).toEqual(
      expect.arrayContaining([
        'Kpi',
        'Chart',
        'Table',
        'Map',
        'Facets',
        'Callout',
        'Value',
        'Gauge',
        'Section',
        'Row',
        'ShowAbove',
        'ShowBelow',
        'Params',
        'Select',
        'Toggle',
        'Range',
        'DateRange',
      ]),
    );
  });

  it('Chart and Map carry kind variants; other components do not', () => {
    expect(catalog.Chart.variants?.values).toContain('pie');
    expect(catalog.Map.variants?.values).toEqual(['choropleth', 'point']);
    expect(catalog.Kpi.variants).toBeUndefined();
  });

  it('every widget is a real catalog component', () => {
    for (const w of WIDGETS) expect(catalog[w]).toBeDefined();
  });

  it('every schema names itself and has an attributes array', () => {
    for (const name of componentNames) {
      expect(catalog[name].name).toBe(name);
      expect(Array.isArray(catalog[name].attributes)).toBe(true);
    }
  });
});
