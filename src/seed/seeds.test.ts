// The ?doc= seed picker: both boot shapes (platform `?href=<outer url>` vs vite dev's
// bare search), the default, and unparseable input failing closed to the default.

import { describe, it, expect } from 'vitest';
import { seedFromBootLocation, MERIDIAN_SEED, CALDERA_SEED, USAGE_SEED } from './seeds.ts';

describe('seedFromBootLocation', () => {
  it('the platform shape: the doc param rides inside the encoded boot href', () => {
    const outer = 'https://immediately.run/present/github/immediately-run/reckoner/main/files/src/App.tsx?doc=caldera';
    const search = '?href=' + encodeURIComponent(outer);
    expect(seedFromBootLocation({ search })).toBe(CALDERA_SEED);
  });

  it('the vite-dev shape: a bare ?doc= search', () => {
    expect(seedFromBootLocation({ search: '?doc=caldera' })).toBe(CALDERA_SEED);
  });

  it('no doc param → the default Meridian document', () => {
    expect(seedFromBootLocation({ search: '' })).toBe(MERIDIAN_SEED);
    const outer = 'https://immediately.run/present/github/immediately-run/reckoner/main/files/src/App.tsx';
    expect(seedFromBootLocation({ search: '?href=' + encodeURIComponent(outer) })).toBe(MERIDIAN_SEED);
  });

  it('an unknown doc value and garbage hrefs fail closed to the default', () => {
    expect(seedFromBootLocation({ search: '?doc=ghost' })).toBe(MERIDIAN_SEED);
    expect(seedFromBootLocation({ search: '?href=' + encodeURIComponent('not a url::%zz') })).toBe(MERIDIAN_SEED);
    expect(seedFromBootLocation({ search: '?href=%zz' })).toBe(MERIDIAN_SEED);
  });

  it('the usage workbook rides the same picker: ?doc=usage in both boot shapes', () => {
    expect(seedFromBootLocation({ search: '?doc=usage' })).toBe(USAGE_SEED);
    const outer = 'https://immediately.run/present/github/immediately-run/reckoner/main/files/src/App.tsx?doc=usage';
    expect(seedFromBootLocation({ search: '?href=' + encodeURIComponent(outer) })).toBe(USAGE_SEED);
  });

  it('the seeds are distinct documents with the feed flags set correctly', () => {
    expect(MERIDIAN_SEED.demoFeed).toBe(true);
    expect(CALDERA_SEED.demoFeed).toBe(false);
    expect(CALDERA_SEED.root).toBe('caldera');
    expect(Object.keys(CALDERA_SEED.files).length).toBeGreaterThan(5);
    expect(USAGE_SEED.usageFeeds).toBe(true);
    expect(USAGE_SEED.demoFeed).toBeUndefined();
    expect(USAGE_SEED.root).toBe('usage');
  });
});
