// The bundled documents the app can open with zero prompts, and how the URL picks
// one (R3-382 follow-out: the Caldera LBO demo served from main behind ?doc=caldera,
// so the present URL rides the zip cache instead of the anonymous GitHub API).
//
// Boot contract: on the platform, the sandbox's location.search is `?href=<encoded
// outer URL>` and the OUTER URL carries the user-visible query (ContentViewer builds
// the startRoute from window.location.search); in vite dev there is no href param
// and location.search stands alone. Both shapes are read; anything unparseable
// falls back to the default document.

import { CALDERA_FILES, CALDERA_ROOT } from './caldera.ts';
import { SEED_FILES, SEED_ROOT } from './document.ts';
import { USAGE_FILES, USAGE_ROOT } from './usage.ts';

/**
 * A bundled document the app can open with zero prompts. `demoFeed` marks the document
 * as reading the app-supplied live demo feed (Meridian does; Caldera does not, so its
 * session skips the feed runtime and the feed's xref allowance). `usageFeeds` marks the
 * usage workbook, whose rollup feeds the app supplies from `src/app/usageFeeds.ts`
 * (PLATFORM_TELEMETRY_SPEC §13, R3-349).
 */
export interface SeedDocument {
  root: string;
  files: Record<string, string>;
  demoFeed?: boolean;
  usageFeeds?: boolean;
}

export const MERIDIAN_SEED: SeedDocument = { root: SEED_ROOT, files: SEED_FILES, demoFeed: true };
export const CALDERA_SEED: SeedDocument = { root: CALDERA_ROOT, files: CALDERA_FILES, demoFeed: false };
export const USAGE_SEED: SeedDocument = { root: USAGE_ROOT, files: USAGE_FILES, usageFeeds: true };

/**
 * Where the app's own route space begins inside the path the host gave it (R3-553).
 *
 * `files/` and `corpus/` are accepted and STRIPPED rather than treated as unknown routes: the
 * SDK's link builder prefixes `files/` unless a caller opts out, and every URL this app has
 * ever published is of that shape (`…/main/files/src/App.tsx?doc=usage`). They are a
 * filesystem-space spelling of the same route, not a second space — 404ing on the difference
 * would break the links in `README.md`. Mirrors `landing-page/src/lib/routeSpace.ts`, which
 * hit and documented this first.
 */
export function appPathFromSandboxPath(sandboxPath: string | undefined | null): string {
  if (!sandboxPath) return '/';
  const segs = sandboxPath.split('/').filter(Boolean);
  if (segs[0] === 'files' || segs[0] === 'corpus') segs.shift();
  return segs.length === 0 ? '/' : `/${segs.join('/')}`;
}

/**
 * Every bundled document, in the order a reader should meet them — the ONE home for the
 * document set (R3-553).
 *
 * The slug IS the seed root, so there is no second vocabulary to keep in step: a renamed root
 * changes its URL, its nav entry and its tests together. Adding a document here is the whole
 * change; nothing else enumerates them.
 */
export const DOCUMENTS: readonly { seed: SeedDocument; label: string }[] = [
  { seed: MERIDIAN_SEED, label: 'Meridian' },
  { seed: CALDERA_SEED, label: 'Caldera' },
  { seed: USAGE_SEED, label: 'Usage' },
];

/**
 * The document a path NAMES, or `null` when it names none (R3-553).
 *
 * Three-valued on purpose, and the reason is a bug this had before review caught it.
 * Collapsing "names no document" into "names the default document" makes the two
 * indistinguishable, and the query fallback below then overrides an explicit `/meridian` — so
 * from any published `?doc=` link (which is all of them), the nav's Meridian entry moved the
 * URL and left the wrong document on screen.
 *
 * `null` covers `/` (the bare app root) and any unknown slug — including `/src/App.tsx`, which
 * is what `…/files/src/App.tsx` normalises to. That is how every legacy URL keeps working
 * without a special case: it names no document, so the `?doc=` it carries decides, exactly as
 * it always did.
 */
export function documentAtPath(appPath: string | undefined | null): SeedDocument | null {
  const slug = appPathFromSandboxPath(appPath).split('/').filter(Boolean)[0];
  return DOCUMENTS.find((d) => d.seed.root === slug)?.seed ?? null;
}

/**
 * The document a path selects, defaulting when it names none.
 *
 * The forgiving wrapper: this app has no not-found surface, and a stale link should open
 * something rather than nothing. A caller that must distinguish "no document named" — which is
 * every caller deciding whether a query may override — wants {@link documentAtPath}.
 */
export function seedFromAppPath(appPath: string): SeedDocument {
  return documentAtPath(appPath) ?? MERIDIAN_SEED;
}

/**
 * The document for one boot: PATH first, then `?doc=`, then the default.
 *
 * The precedence only shows up on a legacy link once the app emits paths, because such a link
 * carries both. The path wins when it NAMES a document — it is the one a user can navigate to
 * and Back out of — and only a path that names none defers to the query.
 */
export function seedForBoot(appPath: string | undefined | null, loc: { search: string }): SeedDocument {
  return documentAtPath(appPath) ?? seedFromBootLocation(loc);
}

/** Pick the bundled document from a boot location (see the module comment for both shapes). */
export function seedFromBootLocation(loc: { search: string }): SeedDocument {
  const direct = new URLSearchParams(loc.search);
  let doc = direct.get('doc');
  if (doc === null) {
    const href = direct.get('href');
    if (href !== null) {
      try {
        doc = new URL(href).searchParams.get('doc');
      } catch {
        /* an unparseable boot href is not ours to interpret — default document */
      }
    }
  }
  if (doc === 'caldera') return CALDERA_SEED;
  if (doc === 'usage') return USAGE_SEED;
  return MERIDIAN_SEED;
}
