// Shared widget plumbing: read the current `params.<name>` value (falling back to the widget's
// literal `default` before the viewer has picked) and get a setter that writes the param back
// through the Bindings port. Component-free so the widget files satisfy the Fast-Refresh rule.

import type { Value } from '../../../stdlib/types.ts';
import { useBindings, useSource } from '../bindingsContext.ts';

export function useParam(name: string, fallback: Value): { value: Value; set: (v: Value) => void } {
  const bindings = useBindings();
  const bound = useSource(`params.${name}`);
  const value = bound.status === 'ok' ? bound.value : fallback;
  return { value, set: (v: Value) => bindings.setParam(name, v) };
}
