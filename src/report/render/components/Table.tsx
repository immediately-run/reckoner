// Table — matrix display (§3.3). Binds a `source` to rows and shows the literal `columns`
// list; `sortable` makes headers toggle an in-view sort (a pure view op — the data channel is
// untouched). Cells format by value type. Non-table / non-ok binding → broken tile.
import { useState } from 'react';
import type { ComponentNode } from '../../nodes.ts';
import type { Row, Value } from '../../../stdlib/types.ts';
import { useSource } from '../bindingsContext.ts';
import { asRows } from '../shape.ts';
import { attrString, attrBool, attrStringArray } from '../attrs.ts';
import { formatScalar } from '../format.ts';
import BrokenTile from './BrokenTile.tsx';
import TierSlot from './TierSlot.tsx';

function compare(a: Value, b: Value): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

export default function Table({ node }: { node: ComponentNode }) {
  const bound = useSource(attrString(node, 'source'));
  const columns = attrStringArray(node, 'columns');
  const sortable = attrBool(node, 'sortable');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);

  if (bound.status !== 'ok') {
    return <BrokenTile component="Table" reason={bound.message ?? 'unavailable'} variant={bound.status === 'missing' ? 'needs-access' : 'error'} />;
  }
  const rowsR = asRows(bound.value);
  if (!rowsR.ok) return <BrokenTile component="Table" reason={rowsR.reason} />;
  const cols = columns.length > 0 ? columns : Object.keys(rowsR.data[0] ?? {});

  let rows: Row[] = rowsR.data;
  if (sort !== null) {
    rows = [...rows].sort((r1, r2) => compare(r1[sort.col] ?? null, r2[sort.col] ?? null) * sort.dir);
  }

  const onSort = (col: string): void => {
    if (!sortable) return;
    setSort((prev) => (prev?.col === col ? { col, dir: prev.dir === 1 ? -1 : 1 } : { col, dir: 1 }));
  };

  return (
    <figure className="rk-tile rk-table-tile">
      <TierSlot tier={bound.tier} />
      <div className="rk-table-scroll">
        <table className="rk-table" data-sortable={sortable || undefined}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} onClick={() => onSort(c)} aria-sort={sort?.col === c ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  {c}
                  {sortable && sort?.col === c ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => {
                  const v = r[c] ?? null;
                  return (
                    <td key={c} data-numeric={typeof v === 'number' || undefined}>
                      {formatScalar(typeof v === 'object' && v !== null ? null : v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
