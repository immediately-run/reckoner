// ShowBelow — the complement of ShowAbove (§3.3.1 point 4): render when the measured
// dimension is `<` the literal threshold. Same axis rule (one of width/height/dpr), same
// conditional-render (not display:none) semantics, same resize ≠ recompute guarantee.
import type { ComponentNode } from '../../nodes.ts';
import { attrNumber } from '../attrs.ts';
import { useRenderNodes } from '../renderContext.ts';
import { useContainerSize, useDpr } from '../useContainerWidth.ts';

export default function ShowBelow({ node }: { node: ComponentNode }) {
  const renderNodes = useRenderNodes();
  const { ref, width, height } = useContainerSize();
  const dpr = useDpr();

  const wT = attrNumber(node, 'width');
  const hT = attrNumber(node, 'height');
  const dT = attrNumber(node, 'dpr');

  const measured = wT !== undefined ? width : hT !== undefined ? height : dpr;
  const threshold = wT ?? hT ?? dT ?? 0;
  const show = measured < threshold;

  return (
    <div className="rk-responsive" ref={ref} data-show={show || undefined}>
      {show ? renderNodes(node.children) : null}
    </div>
  );
}
