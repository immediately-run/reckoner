import { describe, it, expect } from 'vitest';
import { resolveCompat } from './compat.ts';
import type { AppVersions } from './compat.ts';
import type { ReckonerManifest } from './types.ts';

const app: AppVersions = { formats: [1], stdlib: '1.4.0', catalog: '1.2.0', tierTag: 1 };

const doc = (over: Partial<ReckonerManifest> = {}): ReckonerManifest => ({
  format: 1,
  compat: { stdlib: '>=1.0 <2', catalog: '>=1.0 <2', tierTag: 1 },
  worksheets: [],
  params: {},
  ...over,
});

describe('resolveCompat (DOCUMENT_VERSIONING §2)', () => {
  it('runs when the app satisfies every range', () => {
    expect(resolveCompat(app, doc())).toEqual({ status: 'run' });
  });

  it('runs when the app is newer, same major (additive-only)', () => {
    expect(resolveCompat(app, doc({ compat: { stdlib: '>=1.2 <2', catalog: '>=1.0 <2' } }))).toEqual({
      status: 'run',
    });
  });

  it('degrades when the document needs a newer stdlib or catalog', () => {
    const v = resolveCompat(app, doc({ compat: { stdlib: '>=1.6 <2', catalog: '>=1.5 <2' } }));
    expect(v.status).toBe('degrade');
    if (v.status === 'degrade') {
      expect(v.reasons).toHaveLength(2);
      expect(v.reasons[0]).toMatch(/stdlib/);
      expect(v.reasons[1]).toMatch(/catalog/);
    }
  });

  it('refuses an unknown format major', () => {
    const v = resolveCompat(app, doc({ format: 2 }));
    expect(v.status).toBe('refuse');
    if (v.status === 'refuse') expect(v.reason).toMatch(/format 2/);
  });

  it('runs when compat ranges are absent', () => {
    expect(resolveCompat(app, doc({ compat: {} }))).toEqual({ status: 'run' });
  });
});
