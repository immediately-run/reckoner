// TestIndex — the reflection component listing the workbook's test assets
// (AUTHORS_VIEW_SPEC §2): kind label, subject, name, and the latest computed outcome
// (pass/fail + message; a pending suite shows the distinct pending state, never a
// fabricated outcome). Filters are typed and refuse unknown targets with a broken tile.
import type { ComponentNode } from '../../nodes.ts';
import { attrString } from '../attrs.ts';
import { useReflection } from '../reflectionContext.ts';
import BrokenTile from './BrokenTile.tsx';

export default function TestIndex({ node }: { node: ComponentNode }) {
  const reflection = useReflection();
  const worksheet = attrString(node, 'worksheet');
  const subject = attrString(node, 'subject');

  if (reflection === null) {
    return <BrokenTile component="TestIndex" reason="available only in the author's view" />;
  }

  let tests = reflection.tests();
  if (worksheet !== undefined) {
    if (!tests.some((t) => t.worksheet === worksheet) && !reflection.cells().some((c) => c.worksheet === worksheet)) {
      return <BrokenTile component="TestIndex" reason={`unknown worksheet "${worksheet}"`} />;
    }
    tests = tests.filter((t) => t.worksheet === worksheet);
  }
  if (subject !== undefined) {
    if (!reflection.cells().some((c) => c.id === subject)) {
      return <BrokenTile component="TestIndex" reason={`unknown subject "${subject}"`} />;
    }
    tests = tests.filter((t) => t.subject === subject);
  }

  if (tests.length === 0) {
    return <div className="rk-refl-none">no tests declared{worksheet !== undefined || subject !== undefined ? ' for this filter' : ''}.</div>;
  }

  return (
    <div className="rk-refl-index">
      {tests.map((t) => {
        const outcome =
          reflection.verdicts === null
            ? undefined
            : reflection.verdicts.get(t.subject)?.outcomes.find((o) => o.id === t.id);
        const outcomeLabel =
          reflection.verdicts === null ? 'pending' : outcome === undefined ? '—' : outcome.pass ? 'pass' : 'fail';
        return (
          <div key={t.id} className={`rk-refl-test ${outcome?.pass === false ? 'rk-refl-test--fail' : ''}`}>
            <span className="rk-refl-kind">{t.kind}</span>
            <span className="rk-refl-name">{t.name}</span>
            <span className="rk-refl-subject">→ {t.subject}</span>
            <span className="rk-refl-outcome">{outcomeLabel}</span>
            {outcome !== undefined && !outcome.pass && outcome.message !== '' && (
              <div className="rk-refl-test-msg">{outcome.message}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
