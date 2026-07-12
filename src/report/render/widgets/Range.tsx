// Range widget — writes a numeric `params.<name>` bounded by literal min/max/step (§3.3). The
// declared bounds double as validation: the widget can only produce values in range.
import type { ComponentNode } from '../../nodes.ts';
import { attrString, attrNumber } from '../attrs.ts';
import { useParam } from './useParam.ts';

export default function Range({ node }: { node: ComponentNode }) {
  const name = attrString(node, 'name') ?? '';
  const min = attrNumber(node, 'min') ?? 0;
  const max = attrNumber(node, 'max') ?? 100;
  const step = attrNumber(node, 'step') ?? 1;
  const def = attrNumber(node, 'default') ?? min;
  const { value, set } = useParam(name, def);
  const current = typeof value === 'number' ? value : def;
  return (
    <label className="rk-widget rk-widget-range">
      <span className="rk-widget-label">
        {name} <span className="rk-widget-num">{current}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={current} onChange={(e) => set(Number(e.target.value))} />
    </label>
  );
}
