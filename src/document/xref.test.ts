// Cross-reference validation (the deferred item in the document barrel, now shipped).

import { describe, it, expect } from 'vitest';
import { validateExternalReferences, validateFixtureProvenance } from './xref.ts';
import type { XRefAvailability } from './xref.ts';
import type { FixtureFile } from './types.ts';

const available: XRefAvailability = {
  feeds: new Set(['orders']),
  fixtures: new Set(['orders_holdout']),
  params: new Set(['region', 'span']),
  worksheetPaths: { revenue: 'worksheets/revenue.sheet.js' },
};

describe('validateExternalReferences — worksheet inputs', () => {
  it('a feed the document (or runtime) does not supply is an error', () => {
    const out = validateExternalReferences([{ key: 'feeds.ghost', site: 'revenue.by_month' }], available);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('error');
    expect(out[0].file).toBe('worksheets/revenue.sheet.js'); // anchored at the declaring file
    expect(out[0].message).toContain('feeds.ghost');
    expect(out[0].message).toContain('"ghost"');
  });

  it('a runtime feed counts as supplied (the demo feed is app infra, not a document feed)', () => {
    const out = validateExternalReferences(
      [{ key: 'feeds.live_regions', site: 'review.live_by_region' }],
      { ...available, feeds: new Set([...available.feeds, 'live_regions']), worksheetPaths: { review: 'worksheets/review.sheet.js' } },
    );
    expect(out).toEqual([]);
  });

  it('a missing fixture is an error naming what exists', () => {
    const out = validateExternalReferences([{ key: 'fixtures.ghost', site: 'revenue.total' }], available);
    expect(out[0].severity).toBe('error');
    expect(out[0].message).toContain('orders_holdout');
  });

  it('the static namespace has no supplier today — any read is an error', () => {
    const out = validateExternalReferences([{ key: 'static.fx_rates', site: 'revenue.by_month' }], available);
    expect(out[0].severity).toBe('error');
  });

  it('a param with no default and no widget is a warning (runtime-suppliable, probably a typo)', () => {
    const out = validateExternalReferences([{ key: 'params.tier', site: 'revenue.total' }], available);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].message).toContain('tier');
  });

  it('known references produce nothing', () => {
    expect(
      validateExternalReferences(
        [
          { key: 'feeds.orders', site: 'revenue.by_month' },
          { key: 'fixtures.orders_holdout', site: 'revenue.total' },
          { key: 'params.region', site: 'revenue.total' },
        ],
        available,
      ),
    ).toEqual([]);
  });

  it('keys outside the external namespaces are the graph builder\'s business, not ours', () => {
    expect(validateExternalReferences([{ key: 'revenue', site: 'x.y' }], available)).toEqual([]);
  });
});

describe('validateFixtureProvenance — capture history', () => {
  const fx = (name: string, sourceFeed?: string): FixtureFile => ({
    name,
    path: `fixtures/${name}.frame.json`,
    frame: {
      rows: [],
      provenance: sourceFeed === undefined ? { synthetic: true } : { sourceFeed },
    },
  });

  it('a declared feed is silent', () => {
    expect(validateFixtureProvenance([fx('orders', 'orders')], new Set(['orders']))).toEqual([]);
  });

  it('synthetic fixtures carry no sourceFeed and are silent', () => {
    expect(validateFixtureProvenance([fx('synth')], new Set(['orders']))).toEqual([]);
  });

  it('a dangling citation is a warning — historical provenance, fine for a frozen snapshot', () => {
    const out = validateFixtureProvenance([fx('orders', 'ghost')], new Set(['orders']));
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].file).toBe('fixtures/orders.frame.json');
    expect(out[0].message).toContain('"ghost"');
  });
});
