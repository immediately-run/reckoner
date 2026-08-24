// The inspection port (V3): the renderer offers an optional on-inspect callback per bound
// component. Absent (ordinary run mode without the surface), bound elements render exactly
// as before — the affordance is opt-in at the ReportView call site, never a tax on run mode.
import { createContext } from 'react';
import type { Context } from 'react';

export interface InspectionPort {
  /** Open the value inspector on a cell. */
  onInspect: (cellId: string) => void;
  /** Whether a source names something inspectable (a cell). The affordance hides otherwise. */
  canInspect: (source: string) => boolean;
}

export const InspectionContext: Context<InspectionPort | null> = createContext<InspectionPort | null>(null);
