// Where the app is, in its OWN path space (R3-553).
//
// Two environments, one answer. On immediately.run the host owns the URL and pushes the
// current `sandboxPath` down through `TinkerableContext`; under `vite dev` there is no host
// at all and `window.location.pathname` is the truth. The guard is what makes the same
// component work in both: `TinkerableContext`'s default value is `{} as TinkerableState`, so
// reading `navigationState` without checking gives `undefined` and anything built from it
// throws — locally, where there is no host to notice.
//
// Imported from the SDK's narrow subpath, never the package root: the root pulls in channel
// modules that reach for the host transport at module load, which throws under `vite dev`.
import { use, useSyncExternalStore } from 'react';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import { appPathFromSandboxPath } from '../seed/seeds.ts';
import type { HostLocation } from '../lib/navigation.ts';

const subscribeToHistory = (onChange: () => void): (() => void) => {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
};
const currentLocalPath = (): string => window.location.pathname;
/** `useSyncExternalStore` wants a stable server snapshot; this app is client-rendered. */
const serverPath = (): string => '/';

/**
 * The current app-space path — `/caldera`, `/`.
 *
 * Normalised through {@link appPathFromSandboxPath}, so a `files/`-prefixed link (which is
 * what the SDK's link builder emits by default, and what every URL this app has published
 * looks like) resolves to the same route rather than an unknown one.
 */
export function useAppPath(): string {
  const ctx = use(TinkerableContext);
  const localPath = useSyncExternalStore(subscribeToHistory, currentLocalPath, serverPath);
  const sandboxPath = ctx?.navigationState?.sandboxPath;
  return appPathFromSandboxPath(sandboxPath ?? localPath);
}

/**
 * The host context, narrowed to what navigation needs — empty under `vite dev`.
 *
 * Same guard as {@link useAppPath} and for the same reason: `TinkerableContext`'s default is
 * `{} as TinkerableState`, so an unguarded read hands `undefined` to the href builder, which
 * throws locally.
 */
export function useHostLocation(): HostLocation {
  const ctx = use(TinkerableContext);
  return { outerHref: ctx?.outerHref, navigationState: ctx?.navigationState };
}
