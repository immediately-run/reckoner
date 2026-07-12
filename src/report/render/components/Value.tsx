// Value — an inline bound scalar in prose (§3.3: "echo a viewer selection with
// `<Value source="params.region" />`"). Renders the resolved scalar inline; a non-scalar or
// non-ok binding renders a muted inline marker rather than breaking the sentence.
import type { ComponentNode } from '../../nodes.ts';
import { useSource } from '../bindingsContext.ts';
import { asScalar } from '../shape.ts';
import { attrString } from '../attrs.ts';
import { formatScalar } from '../format.ts';

export default function Value({ node }: { node: ComponentNode }) {
  const bound = useSource(attrString(node, 'source'));
  if (bound.status !== 'ok') return <span className="rk-value rk-value-missing">—</span>;
  const scalar = asScalar(bound.value);
  if (!scalar.ok) return <span className="rk-value rk-value-missing">—</span>;
  return (
    <span className="rk-value" data-tier={bound.tier}>
      {formatScalar(scalar.data)}
    </span>
  );
}
