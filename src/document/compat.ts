// The compatibility resolution rule (DOCUMENT_VERSIONING_SPEC §2/§3). On open, the app
// compares its own versions to the document's `compat`. The additive-only stdlib/catalog
// contract does the heavy lifting — forward compatibility within a major is free — so this
// rule's job is to make the cross-major and old-app-new-document cases *legible*, never to
// produce a plausible-but-wrong render:
//
//   - unknown `format` major        → refuse (never a partial parse)
//   - app newer, same major         → run   (additive-only: the callables still exist)
//   - app older than the doc needs  → degrade (specific cells/components become "needs ≥ x"
//                                     placeholders; the rest runs)

import type { ReckonerManifest } from './types.ts';
import { satisfies } from './semver.ts';

export interface AppVersions {
  /** The document-schema majors this app understands. */
  formats: number[];
  stdlib: string;
  catalog: string;
  tierTag: number;
}

export type CompatVerdict =
  | { status: 'run' }
  | { status: 'degrade'; reasons: string[] }
  | { status: 'refuse'; reason: string };

/** Resolve whether `app` can open a document with the given `manifest`. */
export function resolveCompat(app: AppVersions, manifest: ReckonerManifest): CompatVerdict {
  if (!app.formats.includes(manifest.format)) {
    return {
      status: 'refuse',
      reason: `this report needs Reckoner document format ${manifest.format}; this app understands ${app.formats.join(', ')}.`,
    };
  }

  const reasons: string[] = [];
  const { stdlib, catalog } = manifest.compat;

  if (stdlib !== undefined && !satisfies(app.stdlib, stdlib)) {
    reasons.push(`needs stdlib ${stdlib} (app has ${app.stdlib})`);
  }
  if (catalog !== undefined && !satisfies(app.catalog, catalog)) {
    reasons.push(`needs component catalog ${catalog} (app has ${app.catalog})`);
  }

  // A newer in-file tierTag encoding is not a refusal or a whole-document degrade: an
  // unknown tag is treated as the host-authoritative mount tier and the in-file tag is
  // ignored (§3/OQ-2), so it never up-labels. It is surfaced as an informational reason
  // only when the rest already degrades, and never gates on its own.
  if (reasons.length === 0) return { status: 'run' };
  return { status: 'degrade', reasons };
}
