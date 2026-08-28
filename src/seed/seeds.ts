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

/**
 * A bundled document the app can open with zero prompts. `demoFeed` marks the document
 * as reading the app-supplied live demo feed (Meridian does; Caldera does not, so its
 * session skips the feed runtime and the feed's xref allowance).
 */
export interface SeedDocument {
  root: string;
  files: Record<string, string>;
  demoFeed?: boolean;
}

export const MERIDIAN_SEED: SeedDocument = { root: SEED_ROOT, files: SEED_FILES, demoFeed: true };
export const CALDERA_SEED: SeedDocument = { root: CALDERA_ROOT, files: CALDERA_FILES, demoFeed: false };

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
  return doc === 'caldera' ? CALDERA_SEED : MERIDIAN_SEED;
}
