// The React context that threads the injected `Bindings` port (bindings.ts) to every
// component in the tree, plus the small hooks components use to read it. Kept in its own
// (component-free) module so the Fast-Refresh "only export components" rule stays satisfied
// in the component files — a context/hook export from a component file breaks HMR.

import { createContext, useContext } from 'react';
import type { Bindings, BoundValue } from './bindings.ts';
import { missing } from './bindings.ts';

const FALLBACK: Bindings = {
  resolve: (source) => missing(source),
  setParam: () => {},
};

export const BindingsContext = createContext<Bindings>(FALLBACK);

/** The active data port. */
export function useBindings(): Bindings {
  return useContext(BindingsContext);
}

/** Resolve a single `source` binding to its current value + tier + status. */
export function useSource(source: string | undefined): BoundValue {
  const bindings = useBindings();
  return source === undefined ? missing('(unbound)') : bindings.resolve(source);
}
