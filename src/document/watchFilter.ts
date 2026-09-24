// R3-766 (DOCUMENT_NAVIGATOR_SPEC §4.4): which changes re-render the report. The
// loader and the watch filter must agree on what "the document" is, and one list is
// the only way they stay in step — so this imports the loader's suffix constants
// rather than retyping them. A change to anything else under the root (a README,
// a `.git` tree) is not a document change and must not rebuild.

import { WORKSHEET_SUFFIX, TEMPLATE_SUFFIX, FEED_SUFFIX, FIXTURE_SUFFIX } from './loader.ts';

const MANIFEST_NAME = 'reckoner.json';

/** True when `relPath` names a file the report reads — a worksheet, template, feed,
 *  fixture, or the manifest. Matched by NAME, not directory: the loader's own
 *  `listDir` filtering is suffix-on-filename, so this is too. */
export function isDocumentPath(relPath: string): boolean {
  const name = relPath.split('/').pop() ?? relPath;
  if (name === MANIFEST_NAME) return true;
  return (
    name.endsWith(WORKSHEET_SUFFIX) ||
    name.endsWith(TEMPLATE_SUFFIX) ||
    name.endsWith(FEED_SUFFIX) ||
    name.endsWith(FIXTURE_SUFFIX)
  );
}
