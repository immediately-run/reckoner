// ShowWhen — conditional render by data (§3.3): the children render only when the bound
// cell is exactly `true`. One attribute, one test — the template never computes
// (§3.3.1 "never an expression"), so the worksheet owns the condition as a named, testable
// cell and the template only names it; a template that needs "else" binds a second cell.
// Truthiness is refused by the asBoolean shape guard — a cell that starts returning a count
// must not silently flip the render. A hidden subtree is never mounted (no display:none),
// and unlike ShowAbove this adds no wrapper element: it measures nothing, and a wrapper div
// would only disturb Row's grid. A binding that cannot answer is loud, never silent: an
// alarm hidden because its cell broke is the worst silent failure this component could add.
import type { ComponentNode } from '../../nodes.ts';
import { useSource } from '../bindingsContext.ts';
import { useRenderNodes } from '../renderContext.ts';
import { attrString } from '../attrs.ts';
import { asBoolean } from '../shape.ts';
import BrokenTile from './BrokenTile.tsx';
import BrokenBoundTile from './BrokenBoundTile.tsx';

export default function ShowWhen({ node }: { node: ComponentNode }) {
  const bound = useSource(attrString(node, 'source'));
  const renderNodes = useRenderNodes();

  if (bound.status !== 'ok') return <BrokenBoundTile component="ShowWhen" bound={bound} />;
  const flag = asBoolean(bound.value);
  if (!flag.ok) return <BrokenTile component="ShowWhen" reason={flag.reason} />;
  return flag.data ? <>{renderNodes(node.children)}</> : null;
}
