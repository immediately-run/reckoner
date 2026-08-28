// DataInventory — the reflection component listing the document's data assets
// (AUTHORS_VIEW_SPEC §2, §3.1–§3.3). Fixtures: name, derived shape ("first-row columns"
// — an honest O(1) label, §3.1), the document-AUTHORED tier as plain labeled data (the
// review-1 H2 precedent — never chip chrome, §3.2), and provenance. Feeds: the
// allowlisted projection only (name, mode, scheme+host) — the port never carries raw
// config, so nothing here CAN render a query string or a secretRef (§3.3, G-AV-9).
import type { ComponentNode } from '../../nodes.ts';
import { attrString } from '../attrs.ts';
import { useReflection } from '../reflectionContext.ts';
import BrokenTile from './BrokenTile.tsx';

export default function DataInventory({ node }: { node: ComponentNode }) {
  const reflection = useReflection();
  const kind = attrString(node, 'kind');

  if (reflection === null) {
    return <BrokenTile component="DataInventory" reason="available only in the author's view" />;
  }

  const showFixtures = kind === undefined || kind === 'fixtures';
  const showFeeds = kind === undefined || kind === 'feeds';

  return (
    <div className="rk-refl-index">
      {showFixtures && (
        <div className="rk-refl-datakind">
          <h4 className="rk-refl-datakind-name">fixtures</h4>
          {reflection.fixtures.length === 0 && <div className="rk-refl-none">none in this document.</div>}
          {reflection.fixtures.map((fx) => (
            <div key={fx.name} className="rk-refl-datum">
              <span className="rk-refl-name">{fx.name}</span>
              <span className="rk-refl-shape">
                {fx.rowCount} rows · first-row columns: {fx.firstRowColumns.length === 0 ? '—' : fx.firstRowColumns.join(', ')}
              </span>
              {fx.declaredTier !== undefined && <span className="rk-refl-plain">declared tier: {fx.declaredTier}</span>}
              {fx.sourceFeed !== undefined && <span className="rk-refl-plain">captured from feed “{fx.sourceFeed}”</span>}
            </div>
          ))}
        </div>
      )}
      {showFeeds && (
        <div className="rk-refl-datakind">
          <h4 className="rk-refl-datakind-name">feeds</h4>
          {reflection.feeds.length === 0 && <div className="rk-refl-none">none in this document.</div>}
          {reflection.feeds.map((feed) => (
            <div key={feed.name} className="rk-refl-datum">
              <span className="rk-refl-name">{feed.name}</span>
              {feed.mode !== undefined && <span className="rk-refl-plain">mode: {feed.mode}</span>}
              <span className="rk-refl-plain">{feed.hosts.join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
