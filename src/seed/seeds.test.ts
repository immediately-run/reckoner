// The ?doc= seed picker: both boot shapes (platform `?href=<outer url>` vs vite dev's
// bare search), the default, and unparseable input failing closed to the default.

import { describe, it, expect } from 'vitest';
import {
  seedFromBootLocation,
  seedFromAppPath,
  seedForBoot,
  documentAtPath,
  appPathFromSandboxPath,
  DOCUMENTS,
  MERIDIAN_SEED,
  CALDERA_SEED,
  USAGE_SEED,
} from './seeds.ts';

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

  it('the slugs are LITERAL, because they are the published URL contract (R3-553)', () => {
    // Since the root is also the URL segment, renaming one silently breaks every link anyone
    // has shared — `…/reckoner/main/usage` and the README's. Pinning the strings here makes a
    // rename a deliberate act with a failing test in front of it. Nothing else can: every
    // other assertion in this file reads `seed.root`, so it is true whatever the root says.
    expect(MERIDIAN_SEED.root).toBe('meridian');
    expect(CALDERA_SEED.root).toBe('caldera');
    expect(USAGE_SEED.root).toBe('usage');
  });
});

// R3-553 — the app owns a path space now, so the document comes from the PATH first.
describe('seedFromAppPath', () => {
  // The expected roots are read from the SEEDS, never written as literals: the slug IS the
  // root, so a renamed root must fail this test rather than quietly diverge from the URL.
  it('a slug matching a seed root opens that document', () => {
    expect(seedFromAppPath(`/${USAGE_SEED.root}`)).toBe(USAGE_SEED);
    expect(seedFromAppPath(`/${CALDERA_SEED.root}`)).toBe(CALDERA_SEED);
  });

  it('round-trips: every document is reachable at its own root, with and without a trailing slash', () => {
    // Driven from DOCUMENTS — the single list the app itself routes and renders from — so a
    // new document is covered the day it is added.
    //
    // What this does NOT prove is that a root was not RENAMED: every assertion here reads
    // `seed.root`, so it stays true whatever the root says. The first version claimed
    // otherwise in a comment, and renaming `SEED_ROOT` really did leave every test green.
    // A rename is caught by the literal slugs pinned in the first describe — the published
    // URL contract — and this case proves the other property: that each document is reachable
    // at whatever its root currently is. `documentAtPath` rather than `seedFromAppPath`
    // because the latter's unknown-slug fallback would make even that vacuous.
    expect(DOCUMENTS.length).toBeGreaterThan(1);
    for (const { seed } of DOCUMENTS) {
      expect(documentAtPath(`/${seed.root}`)).toBe(seed);
      expect(documentAtPath(`/${seed.root}/`)).toBe(seed);
      expect(seedFromAppPath(`/${seed.root}`)).toBe(seed);
    }
  });

  it('the default document is selected EXPLICITLY at its own root, not through the fallback', () => {
    // The distinction the blocking bug turned on: `/meridian` names a document, `/` does not.
    expect(documentAtPath(`/${MERIDIAN_SEED.root}`)).toBe(MERIDIAN_SEED);
    expect(documentAtPath('/')).toBeNull();
    expect(documentAtPath('/ghost')).toBeNull();
    expect(documentAtPath('/files/src/App.tsx')).toBeNull();
  });

  it('the root path is the default document', () => {
    expect(seedFromAppPath('/')).toBe(MERIDIAN_SEED);
    expect(seedFromAppPath('')).toBe(MERIDIAN_SEED);
  });

  it('an unknown slug opens the default rather than erroring — a stale link still shows something', () => {
    expect(seedFromAppPath('/ghost')).toBe(MERIDIAN_SEED);
  });

  it('the legacy file-view path resolves, because `files/` is stripped and the rest is unknown', () => {
    // This is why every published `…/main/files/src/App.tsx` link keeps working: not a
    // special case, just normalisation followed by the unknown-slug default.
    expect(seedFromAppPath('/files/src/App.tsx')).toBe(MERIDIAN_SEED);
    expect(seedFromAppPath('/corpus/x')).toBe(MERIDIAN_SEED);
  });

  it('a `files/`-prefixed DOCUMENT link resolves to that document', () => {
    // The SDK's link builder prefixes `files/` unless a caller opts out, so this is the
    // shape an accidentally-default-built link arrives in.
    expect(seedFromAppPath(`/files/${USAGE_SEED.root}`)).toBe(USAGE_SEED);
  });

  it('no slug may collide with a host-intercepted segment', () => {
    // `files`, `bundle` and `corpus` are taken by the host's own URL grammar; a document
    // named for one of them would be unreachable.
    for (const { seed } of DOCUMENTS) {
      expect(['files', 'bundle', 'corpus']).not.toContain(seed.root);
    }
  });

  it('DOCUMENTS is the only enumeration — every seed the module exports appears in it', () => {
    // The nav renders DOCUMENTS and the router resolves through it, so a document added to the
    // module but not to the list would be routable-but-invisible, or the reverse.
    const listed = new Set(DOCUMENTS.map((d) => d.seed));
    for (const seed of [MERIDIAN_SEED, CALDERA_SEED, USAGE_SEED]) expect(listed.has(seed)).toBe(true);
    expect(DOCUMENTS.length).toBe(3);
  });
});

describe('appPathFromSandboxPath', () => {
  it('normalises absence, slashes and the two filesystem-space prefixes', () => {
    expect(appPathFromSandboxPath(undefined)).toBe('/');
    expect(appPathFromSandboxPath(null)).toBe('/');
    expect(appPathFromSandboxPath('')).toBe('/');
    expect(appPathFromSandboxPath('/usage/')).toBe('/usage');
    expect(appPathFromSandboxPath('files/usage')).toBe('/usage');
    expect(appPathFromSandboxPath('/corpus/usage')).toBe('/usage');
    expect(appPathFromSandboxPath('/files')).toBe('/');
  });
});

describe('seedForBoot — precedence', () => {
  it('the PATH wins over the query when a legacy link carries both', () => {
    // The case that only appears once the app emits paths: `/usage` in the path and
    // `?doc=caldera` in the query. The path is the one the user can navigate to and Back
    // out of, so it decides.
    expect(seedForBoot('/usage', { search: '?doc=caldera' })).toBe(USAGE_SEED);
  });

  it('the DEFAULT document wins over the query at its own root — the blocking regression', () => {
    // This returned CALDERA before the fix: `seedForBoot` read "resolved to the default" as
    // "named nothing" and handed the decision to the query. From any published link — all of
    // which carry `?doc=` — clicking Meridian in the nav moved the URL and left the other
    // document on screen.
    expect(seedForBoot(`/${MERIDIAN_SEED.root}`, { search: '?doc=caldera' })).toBe(MERIDIAN_SEED);
    expect(seedForBoot(`/${MERIDIAN_SEED.root}`, { search: '?doc=usage' })).toBe(MERIDIAN_SEED);
  });

  it('the query still decides when the path names no document (every published link today)', () => {
    expect(seedForBoot('/files/src/App.tsx', { search: '?doc=usage' })).toBe(USAGE_SEED);
    expect(seedForBoot('/', { search: '?doc=caldera' })).toBe(CALDERA_SEED);
    expect(seedForBoot(undefined, { search: '?doc=usage' })).toBe(USAGE_SEED);
  });

  it('neither → the default document', () => {
    expect(seedForBoot('/', { search: '' })).toBe(MERIDIAN_SEED);
    expect(seedForBoot('/ghost', { search: '?doc=ghost' })).toBe(MERIDIAN_SEED);
  });
});

// R3-648 fault injection — this commit is REVERTED by the next one. It exists so this
// PR's own check history shows the new gate going red, per the item's rule that a gate
// nobody has seen fail is a gate nobody should trust.
import { it as __faultIt, expect as __faultExpect } from 'vitest';
__faultIt('R3-648 fault injection: the CI gate must fail on a failing test', () =>
  __faultExpect(1).toBe(2),
);
