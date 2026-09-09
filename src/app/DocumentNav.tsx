// The document switcher (R3-553).
//
// It exists because the path space does: before this, a document could only be reached by
// typing a URL, so "navigate between documents and press Back" had nothing to exercise. Each
// entry is a real `<a href>` built in the HOST's URL space — so copy-link, middle-click and
// open-in-new-tab give another reader something that resolves — with `onClick` intercepted
// for the in-app path. Plain clicks only: a modified click is the browser's to handle.
import type { MouseEvent } from 'react';
import { hrefFor, navigateTo, type HostLocation } from '../lib/navigation.ts';
import { DOCUMENTS, type SeedDocument } from '../seed/seeds.ts';

const DocumentNav = ({ loc, current }: { loc: HostLocation; current: SeedDocument }) => (
  <nav className="rk-doc-nav" aria-label="Documents">
    {DOCUMENTS.map(({ seed, label }) => {
      // Every document links to its OWN slug, the default included. `/` still resolves to the
      // default, but it does so by naming no document — so a link to `/` would let a legacy
      // `?doc=` override it, which is precisely the bug this nav's Meridian entry had.
      const appPath = `/${seed.root}`;
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
