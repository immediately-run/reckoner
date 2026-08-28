// SuiteSummary — the reflection component rendering the workbook-level suite line
// (AUTHORS_VIEW_SPEC §2, §3.4): the SAME `summarizeSuite` over the SAME results object
// the workbook panel shows — one computation, two surfaces that cannot disagree. A
// pending suite renders the panel's "Running suites…" line, never a verdict count
// (`summarizeSuite(cells, null)` would count every cell untested — the false-verdict
// render G-AV-6 forbids).
import type { ComponentNode } from '../../nodes.ts';
import { summarizeSuite } from '../../../engine/suiteReport.ts';
import { useReflection } from '../reflectionContext.ts';
import BrokenTile from './BrokenTile.tsx';

export default function SuiteSummary({ node: _node }: { node: ComponentNode }) {
  void _node; // uniform NodeComponent signature; SuiteSummary takes no attributes
  const reflection = useReflection();
  if (reflection === null) {
    return <BrokenTile component="SuiteSummary" reason="available only in the author's view" />;
  }
  if (reflection.verdicts === null) {
    return <div className="rk-refl-suite rk-refl-suite--pending">Running suites…</div>;
  }
  const report = summarizeSuite(reflection.cells(), reflection.verdicts);
  return (
    <div className={`rk-refl-suite ${report.ok ? 'rk-refl-suite--ok' : 'rk-refl-suite--fail'}`} role="status">
      {report.line}
    </div>
  );
}
