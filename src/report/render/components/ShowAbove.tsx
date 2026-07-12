// ShowAbove — conditional render when the measured dimension is ≥ a literal threshold
// (§3.3.1 point 4). Exactly one of `width`/`height` (container px, via ResizeObserver) or
// `dpr` (via matchMedia) selects the axis. This is conditional *render*, not `display:none` —
// a hidden subtree is never mounted (a hidden chart never draws) — and re-evaluated on
// resize/DPR change. Resize ≠ recompute: the data channel is untouched.
import type { ComponentNode } from '../../nodes.ts';
import { attrNumber } from '../attrs.ts';
import { useRenderNodes } from '../renderContext.ts';
import { useContainerSize, useDpr } from '../useContainerWidth.ts';

export default function ShowAbove({ node }: { node: ComponentNode }) {
  const renderNodes = useRenderNodes();
  const { ref, width, height } = useContainerSize();
  const dpr = useDpr();

  const wT = attrNumber(node, 'width');
  const hT = attrNumber(node, 'height');
  const dT = attrNumber(node, 'dpr');

  const measured = wT !== undefined ? width : hT !== undefined ? height : dpr;
  const threshold = wT ?? hT ?? dT ?? 0;
  const show = measured >= threshold;

  return (
    <div className="rk-responsive" ref={ref} data-show={show || undefined}>
      {show ? renderNodes(node.children) : null}
    </div>
  );
}
