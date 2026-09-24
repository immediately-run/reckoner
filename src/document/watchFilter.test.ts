// isDocumentPath must agree with the loader on what "the document" is, and it must
// read from the REAL seed's file map (the producer), not a hand-typed list — a renamed
// suffix in the seed would then fail this suite the same way the loader would.
import { describe, it, expect } from 'vitest';
import { isDocumentPath } from './watchFilter.ts';
import { SEED_FILES, SEED_ROOT } from '../seed/document.ts';

describe('isDocumentPath', () => {
  it('accepts every file the real seed document lists', () => {
    const prefix = `${SEED_ROOT}/`;
    const rels = Object.keys(SEED_FILES).map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p));
    expect(rels.length).toBeGreaterThan(0);
    for (const rel of rels) {
      expect(isDocumentPath(rel)).toBe(true);
    }
  });

  it('accepts a feed path and the manifest by name', () => {
    expect(isDocumentPath('feeds/rollup.feed.json')).toBe(true);
    expect(isDocumentPath('reckoner.json')).toBe(true);
  });

  it('rejects a README, a dot-git tree, and a non-template file under templates/', () => {
    expect(isDocumentPath('README.md')).toBe(false);
    expect(isDocumentPath('.git/HEAD')).toBe(false);
    expect(isDocumentPath('templates/notes.txt')).toBe(false);
  });
});
