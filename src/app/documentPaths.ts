// Part B's relPath gate (DOCUMENT_NAVIGATOR_SPEC §4.3, DN-R7): `manifest.worksheets`
// is author-controlled and validated only for non-empty-string-ness, and under repo
// dispatch the author is not the viewer — a hostile workbook can present a traversal
// path for this app to delegate. Whatever the host does with it, THIS app must not
// construct the delegation: the path is validated HERE, before `capFile` ever sees it.
//
// Pure and total; the affordance calls it synchronously and declines (absent door,
// no message) on a miss, so an unbuildable delegation is never even attempted.

/** The document subdirectories the loader reads (loader.ts's four families). A
 *  delegatable path must live under one of them — the affordance delegates worksheet
 *  source today, and the same gate answers for any future row over the other three. */
const KNOWN_DOCUMENT_DIRS = ['worksheets', 'templates', 'fixtures', 'feeds'] as const;

/** True iff `rel` is a document-relative path this app may hand to `capFile`:
 *  non-empty, relative (no leading `/`), NUL- and backslash-free, every segment real
 *  (no `.`/`..`/empty), and rooted in a known document subdirectory. */
export function validDocumentRelPath(rel: string): boolean {
  if (rel.length === 0) return false;
  if (rel.includes('\0') || rel.includes('\\')) return false;
  if (rel.startsWith('/')) return false;
  const segments = rel.split('/');
  if (segments.some((seg) => seg.length === 0 || seg === '.' || seg === '..')) return false;
  return (KNOWN_DOCUMENT_DIRS as readonly string[]).includes(segments[0]);
}
