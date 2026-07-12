// The chart's visual encoding, read from a `Chart` node's literal attributes (§3.3 catalog).
// Shared by `Chart` (binds a `source`) and `Facets` (feeds each small-multiple a row subset)
// so both draw through the same presentational `ChartFigure`. Pure.

import type { ComponentNode } from '../nodes.ts';
import { attrString, attrNumber } from './attrs.ts';

export type ChartKind = 'bar' | 'line' | 'area' | 'scatter' | 'histogram' | 'pie';
export type StackMode = 'none' | 'stacked' | 'normalized';

export interface ChartEncoding {
  kind: ChartKind;
  x?: string;
  y?: string;
  color?: string;
  size?: string;
  value?: string;
  label?: string;
  stack: StackMode;
  bins: number;
}

const KINDS: ReadonlySet<string> = new Set(['bar', 'line', 'area', 'scatter', 'histogram', 'pie']);

export function readChartEncoding(node: ComponentNode): ChartEncoding {
  const kindAttr = attrString(node, 'kind');
  const kind = (KINDS.has(kindAttr ?? '') ? kindAttr : 'bar') as ChartKind;
  const stackAttr = attrString(node, 'stack');
  const stack: StackMode = stackAttr === 'stacked' || stackAttr === 'normalized' ? stackAttr : 'none';
  return {
    kind,
    x: attrString(node, 'x'),
    y: attrString(node, 'y'),
    color: attrString(node, 'color'),
    size: attrString(node, 'size'),
    value: attrString(node, 'value'),
    label: attrString(node, 'label'),
    stack,
    bins: attrNumber(node, 'bins') ?? 10,
  };
}
