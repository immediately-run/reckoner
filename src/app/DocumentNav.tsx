// The document switcher (R3-553).
//
// It exists because the path space does: before this, a document could only be reached by
// typing a URL, so "navigate between documents and press Back" had nothing to exercise. Each
// entry is a real `<a href>` built in the HOST's URL space — so copy-link, middle-click and
// open-in-new-tab give another reader something that resolves — with `onClick` intercepted
// for the in-app path. Plain clicks only: a modified click is the browser's to handle.
import type { MouseEvent } from 'react';
import { hrefFor, navigateTo, type HostLocation } from '../lib/navigation.ts';
import { CALDERA_SEED, MERIDIAN_SEED, USAGE_SEED, type SeedDocument } from '../seed/seeds.ts';

/** The document's own root IS its slug — one vocabulary, not two kept in step. */
const DOCUMENTS: { seed: SeedDocument; label: string }[] = [
  { seed: MERIDIAN_SEED, label: 'Meridian' },
  { seed: CALDERA_SEED, label: 'Caldera' },
  { seed: USAGE_SEED, label: 'Usage' },
];

/** Meridian is the default document, so it lives at the root rather than at `/meridian`. */
const pathFor = (seed: SeedDocument): string => (seed === MERIDIAN_SEED ? '/' : `/${seed.root}`);

const DocumentNav = ({ loc, current }: { loc: HostLocation; current: SeedDocument }) => (
  <nav className="rk-doc-nav" aria-label="Documents">
    {DOCUMENTS.map(({ seed, label }) => {
      const appPath = pathFor(seed);
      const isCurrent = seed === current;
      return (
        <a
          key={seed.root}
          href={hrefFor(loc, appPath)}
          className="rk-doc-nav-item"
          aria-current={isCurrent ? 'page' : undefined}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            navigateTo(loc, appPath);
          }}
        >
          {label}
        </a>
      );
    })}
  </nav>
);

export default DocumentNav;
