// FormulaIndex — the reflection component listing the workbook's cells (AUTHORS_VIEW_SPEC
// §2): per worksheet, a native collapsible section (navigable on a phone even for a large
// workbook, §1.3) of cards — name, doc, read-only formula source in its own overflow
// container, and the computed verdict chip (pending is its own state, never a verdict).
// No reflection port → the author's-view-only broken tile (spec §6 makes the restriction
// structural); an unknown worksheet filter → broken tile with the reason (§2.2).
import type { ComponentNode } from '../../nodes.ts';
import { attrString } from '../attrs.ts';
import { useReflection } from '../reflectionContext.ts';
import { verdictChip } from '../verdictChip.ts';
import BrokenTile from './BrokenTile.tsx';

export default function FormulaIndex({ node }: { node: ComponentNode }) {
  const reflection = useReflection();
  const worksheet = attrString(node, 'worksheet');

  if (reflection === null) {
    return <BrokenTile component="FormulaIndex" reason="available only in the author's view" />;
  }

  const cells = reflection.cells();
  const worksheets = [...new Set(cells.map((c) => c.worksheet))];
  const shown = worksheet === undefined ? worksheets : worksheets.filter((w) => w === worksheet);
  if (worksheet !== undefined && shown.length === 0) {
    return <BrokenTile component="FormulaIndex" reason={`unknown worksheet "${worksheet}"`} />;
  }

  return (
    <div className="rk-refl-index">
      {shown.map((ws) => (
        <details key={ws} className="rk-refl-sheet" open>
          <summary className="rk-refl-sheet-name">{ws}</summary>
          {cells
            .filter((c) => c.worksheet === ws)
            .map((cell) => {
              const chip = verdictChip(cell.id, reflection.verdicts);
              return (
                <div key={cell.id} className="rk-refl-cell">
                  <div className="rk-refl-cell-head">
                    <span className="rk-refl-name">{cell.cell}</span>
                    <span className={chip.className}>{chip.label}</span>
                  </div>
                  {cell.doc !== '' && <div className="rk-refl-doc">{cell.doc}</div>}
                  <pre className="rk-refl-formula">{cell.formulaSource}</pre>
                </div>
              );
            })}
        </details>
      ))}
    </div>
  );
}
