// Child-rendering context. Container components (Section, Row, Callout, Params, ShowAbove,
// ShowBelow) render their `node.children` by calling back into the single recursive dispatcher
// (Renderer.tsx) through this context — rather than importing the dispatcher directly, which
// would make the module graph cyclic (dispatcher → componentMap → container → dispatcher).
// Component-free so the Fast-Refresh rule holds in the component files.

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { TemplateNode } from '../nodes.ts';

export type RenderNodes = (nodes: TemplateNode[]) => ReactNode;

export const RenderContext = createContext<RenderNodes>(() => null);

export function useRenderNodes(): RenderNodes {
  return useContext(RenderContext);
}
