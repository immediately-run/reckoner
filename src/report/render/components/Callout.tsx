// Callout — an emphasized prose block with a `tone` (info/success/warning/danger). Container:
// renders its children (usually markdown) through the shared dispatcher.
import type { ComponentNode } from '../../nodes.ts';
import { attrString } from '../attrs.ts';
import { useRenderNodes } from '../renderContext.ts';

const TONES: ReadonlySet<string> = new Set(['info', 'success', 'warning', 'danger']);

export default function Callout({ node }: { node: ComponentNode }) {
  const toneAttr = attrString(node, 'tone');
  const tone = TONES.has(toneAttr ?? '') ? toneAttr : 'info';
  const renderNodes = useRenderNodes();
  return (
    <div className="rk-callout" data-tone={tone} role="note">
      {renderNodes(node.children)}
    </div>
  );
}
