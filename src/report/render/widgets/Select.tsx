// Select widget — writes a `params.<name>` from a closed literal `options` list (§3.3). The
// declared options double as validation: the widget can only produce values from its set.
import type { ComponentNode } from '../../nodes.ts';
import { attrString, attrStringArray } from '../attrs.ts';
import { useParam } from './useParam.ts';

export default function Select({ node }: { node: ComponentNode }) {
  const name = attrString(node, 'name') ?? '';
  const options = attrStringArray(node, 'options');
  const def = attrString(node, 'default') ?? options[0] ?? '';
  const { value, set } = useParam(name, def);
  const current = typeof value === 'string' ? value : def;
  return (
    <label className="rk-widget rk-widget-select">
      <span className="rk-widget-label">{name}</span>
      <select value={current} onChange={(e) => set(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
