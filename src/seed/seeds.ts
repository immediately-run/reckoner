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
 * Pick the bundled document from the app's own path (R3-553).
 *
 * The slugs ARE the seed roots — `USAGE_ROOT`, `CALDERA_ROOT` — rather than a second
 * vocabulary that has to be kept in step with them. An unknown slug is the default document,
 * not an error: this app has no not-found surface, and a stale link should open something.
 *
 * Note what is deliberately NOT here: a rule for `files/src/App.tsx`. Normalisation strips
 * the `files/` prefix, leaving `/src/App.tsx`, which is an unknown slug and therefore
 * Meridian — the same answer the old `?doc=`-less link gave. The legacy URL keeps working
 * because it falls through, not because it is special-cased.
 */
export function seedFromAppPath(appPath: string): SeedDocument {
  const slug = appPathFromSandboxPath(appPath).split('/').filter(Boolean)[0];
  if (slug === CALDERA_ROOT) return CALDERA_SEED;
  if (slug === USAGE_ROOT) return USAGE_SEED;
  return MERIDIAN_SEED;
}

/**
 * The document for one boot: PATH first, then `?doc=`, then the default.
 *
 * The order matters and only shows up on a legacy link once the app starts emitting paths,
 * because such a link carries both — `/usage` in the path and `?doc=usage` in the query. Path
 * wins because it is the one the user can navigate to and Back out of; the query is the
 * compatibility surface.
 */
export function seedForBoot(appPath: string | undefined | null, loc: { search: string }): SeedDocument {
  const fromPath = seedFromAppPath(appPathFromSandboxPath(appPath));
  return fromPath === MERIDIAN_SEED ? seedFromBootLocation(loc) : fromPath;
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
