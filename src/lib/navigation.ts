// App-space navigation, in both environments (R3-553).
//
// Imports come from the SDK's NARROW subpaths, never the package root: the root pulls in
// channel modules that reach for the host transport at module load, which throws outright
// under `vite dev` where there is no host. The failure is a blank page and one console line,
// and it looks nothing like "you imported too much" — hence two import lines instead of one.
import { navigate as sdkNavigate } from '@immediately-run/sdk/routing';
import { constructOuterUrl } from '@immediately-run/sdk/urlUtils';
import type { NavigationState } from '@immediately-run/sdk/TinkerableContext';

/** What the host told us about where we are. All fields absent under `vite dev`. */
export interface HostLocation {
  outerHref?: string;
  navigationState?: NavigationState;
}

/** True when the app is running inside the host. Checked on the CONTEXT rather than by
 *  probing for a transport, because the context is what the href builder needs and a
 *  transport without one would not help. */
export function hasHost(loc: HostLocation): loc is Required<HostLocation> {
  return Boolean(loc.outerHref && loc.navigationState);
}

/**
 * The href to render for an app-space path. On the platform this is an absolute URL in the
 * HOST's space, which is what makes copy-link, middle-click and open-in-new-tab produce
 * something that resolves for another reader. Locally it is the path itself.
 *
 * `addFilesPrefix: false` is MANDATORY, not a preference: the default prefixes `files/`, so
 * `/usage` would become `/files/usage` — a filesystem-space URL for a document route.
 */
export function hrefFor(loc: HostLocation, appPath: string): string {
  if (!hasHost(loc)) return appPath;
  return constructOuterUrl(loc.outerHref, appPath, loc.navigationState, false);
}

/**
 * Navigate to an app-space path.
 *
 * On the platform this asks the HOST to change the URL; the host then pushes the new
 * `sandboxPath` back down, which is what re-renders the app. There is deliberately no
 * optimistic local state update on that path — the host's push is the single source of truth,
 * and updating ahead of it would let the two disagree. Locally there is no host, so the app
 * drives its own history and synthesises the `popstate` that `useAppPath` listens for.
 */
export function navigateTo(loc: HostLocation, appPath: string): void {
  if (hasHost(loc)) {
    sdkNavigate(hrefFor(loc, appPath));
    return;
  }
  window.history.pushState(null, '', appPath);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
