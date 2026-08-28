// Verdict chip class/label mapping for the reflection components (AUTHORS_VIEW_SPEC
// §2.3, G-AV-6): the four computed coverage states use the same class vocabulary the
// workbook panel's cards use, and the PENDING state — suite results not yet computed —
// is its own class and label, deliberately none of the four (a pending render styled as
// `untested` would be the four-state mislabel the panel forbids).
import type { CellVerdict } from '../../engine/testrunner.ts';
import type { SubjectResult } from '../../engine/worker/protocol.ts';

const VERDICT_CLASS: Record<CellVerdict, string> = {
  validated: 'rk-verdict--validated',
  pinned: 'rk-verdict--pinned',
  untested: 'rk-verdict--untested',
  failing: 'rk-verdict--failing',
};

export interface ChipSpec {
  className: string;
  label: string;
}

/**
 * The chip for a subject given the (possibly pending) suite results: a computed verdict
 * when results exist — a subject absent from the map is the computed `untested` — and
 * the distinct pending presentation while they are null.
 */
export function verdictChip(subject: string, results: ReadonlyMap<string, SubjectResult> | null): ChipSpec {
  if (results === null) return { className: 'rk-verdict rk-verdict--pending', label: 'pending' };
  const verdict: CellVerdict = results.get(subject)?.verdict ?? 'untested';
  return { className: `rk-verdict ${VERDICT_CLASS[verdict]}`, label: verdict };
}
