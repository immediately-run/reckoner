// The usage workbook (R3-349) end-to-end over the real pipeline: the bundled document
// loads clean, its cross-references resolve against the app-supplied rollup feeds, the
// dimension-defensive formulas run in the engine, and a served rollup frame recomputes
// the report — all offline (the egress leg is exercised in usageFeeds.test.ts).

import { describe, expect, it } from 'vitest';
import { buildReportSession, sessionBindings } from './reportSession.ts';
import { inMemoryTransport } from '../engine/workerTransport.ts';
import { USAGE_SEED } from '../seed/seeds.ts';

describe('the usage workbook document', () => {
  it('loads, validates, and titles itself with no error diagnostics', async () => {
    const session = await buildReportSession(inMemoryTransport(), USAGE_SEED);
    expect(session.title).toBe('immediately.run — usage');
    expect(session.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(session.runtimeFeeds).toContain('repos_daily');
    expect(session.runtimeFeeds).toContain('usage_meta');
  });

  it('renders honestly before any frame arrives: totals are zero, tables empty', async () => {
    const session = await buildReportSession(inMemoryTransport(), USAGE_SEED);
    const bindings = sessionBindings(session, () => {});
    expect(bindings.resolve('usage.runs_total')).toMatchObject({ status: 'ok', value: 0 });
    expect(bindings.resolve('usage.top_repos')).toMatchObject({ status: 'ok', value: [] });
    expect(bindings.resolve('usage.feed_health')).toMatchObject({ status: 'ok', value: [] });
  });

  it('a served rollup frame flows through: day aggregation, top list, suppression total', async () => {
    const session = await buildReportSession(inMemoryTransport(), USAGE_SEED);
    await session.engine.update({
      'feeds.repos_daily': {
        value: [
          { day: '2026-08-27', name: 'immediately-run/reckoner', count: 41 },
          { day: '2026-08-28', name: 'immediately-run/reckoner', count: 30 },
          { day: '2026-08-28', name: 'immediately-run/grove', count: 25 },
        ],
        tier: 'pulled',
      },
      'feeds.usage_meta': {
        value: [
          { rollup: 'repos.daily', status: 'ok', cells: 3, suppressed: 3, kFloor: 20, from: '2026-08-01', to: '2026-08-28' },
          { rollup: 'llm.daily', status: 'forbidden', cells: 0, suppressed: 2, kFloor: 20, from: '2026-08-01', to: '2026-08-28' },
        ],
        tier: 'pulled',
      },
    });
    const bindings = sessionBindings(session, () => {});

    expect(bindings.resolve('usage.runs_total')).toMatchObject({ status: 'ok', value: 96 });
    expect(bindings.resolve('usage.runs_by_day').value).toEqual([
      { day: '2026-08-27', count: 41 },
      { day: '2026-08-28', count: 55 },
    ]);
    expect(bindings.resolve('usage.top_repos').value).toEqual([
      { repository: 'immediately-run/reckoner', runs: 71 },
      { repository: 'immediately-run/grove', runs: 25 },
    ]);
    expect(bindings.resolve('usage.suppressed_total')).toMatchObject({ status: 'ok', value: 5 });
  });

  it('the document ships honest tests: the property legs validate on the empty state', async () => {
    const session = await buildReportSession(inMemoryTransport(), USAGE_SEED);
    const verdicts = await session.engine.runTests();
    expect(verdicts.get('usage.runs_by_day')?.verdict).toBe('validated');
    expect(verdicts.get('usage.suppressed_total')?.verdict).toBe('validated');
  });
});
