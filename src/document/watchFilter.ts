// R3-766 (DOCUMENT_NAVIGATOR_SPEC §4.4): which changes re-render the report. The loader
// and the watch filter must agree on what "the document" is, and one list is the only
// way they stay in step — so this imports the loader's suffix constants rather than
// retyping them. Each suffix is scoped to the DIRECTORY the loader reads it from —
// `templates/*.mdx`, `worksheets/*.sheet.js`, `feeds/*.feed.json`, `fixtures/*.frame.json`
// — plus the root manifest. A document-suffixed file anywhere else (a root `README.mdx`)
// is not a document change and must not rebuild.

import { WORKSHEET_SUFFIX, TEMPLATE_SUFFIX, FEED_SUFFIX, FIXTURE_SUFFIX, MANIFEST_NAME } from './loader.ts';

/** True when `relPath` names a file the report reads, at the directory the loader reads
 *  it from. `relPath` is the watch event's root-relative path. */
export function isDocumentPath(relPath: string): boolean {
  if (relPath === MANIFEST_NAME) return true;
  if (relPath.startsWith('worksheets/')) return relPath.endsWith(WORKSHEET_SUFFIX);
  if (relPath.startsWith('templates/')) return relPath.endsWith(TEMPLATE_SUFFIX);
  if (relPath.startsWith('feeds/')) return relPath.endsWith(FEED_SUFFIX);
  if (relPath.startsWith('fixtures/')) return relPath.endsWith(FIXTURE_SUFFIX);
  return false;
}
