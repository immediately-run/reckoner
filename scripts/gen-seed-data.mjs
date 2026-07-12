// Regenerate src/seed/data.ts from the Meridian case-study CSVs. Run from the repo root:
//   node scripts/gen-seed-data.mjs
// The demo document's frozen fixtures are the real, verified Meridian figures (generate.py,
// seed=20260709) sliced to the last 12 months (+ 4 signup cohorts) so the report is compact.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'docs/case-study/meridian/data');
const OUT = join(ROOT, 'src/seed/data.ts');

function csv(name) {
  const text = readFileSync(join(DATA, name), 'utf8').trim();
  const [head, ...lines] = text.split('\n');
  const cols = head.split(',');
  return lines.map((l) => {
    const cells = l.split(',');
    const o = {};
    cols.forEach((c, i) => (o[c] = cells[i]));
    return o;
  });
}
const num = (s) => (s === '' || s === undefined ? null : Number(s));
const monthsBetween = (a, b) => {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};

const last12 = csv('exec_summary.csv')
  .slice(-12)
  .map((r) => ({
    month: r.month,
    mrr: Math.round(num(r.mrr)),
    momGrowthPct: num(r.mom_growth_pct),
    nrrPct: num(r.nrr_pct),
    grossChurnPct: num(r.gross_churn_pct),
    vsTargetBasePct: num(r.vs_target_base_pct),
  }));

const mov = csv('mrr_movements.csv')
  .slice(-12)
  .map((r) => ({
    month: r.month,
    newMrr: Math.round(num(r.new)),
    expansion: Math.round(num(r.expansion)),
    contraction: Math.round(num(r.contraction)),
    churned: Math.round(num(r.churned)),
    reactivation: Math.round(num(r.reactivation)),
    endMrr: Math.round(num(r.end_mrr)),
  }));

const subs = csv('subscriptions.csv');
const latest = subs.reduce((m, r) => (r.month > m ? r.month : m), '0000-00');
const byRegion = {};
for (const r of subs) {
  if (r.month !== latest) continue;
  const g = (byRegion[r.region] ??= { region: r.region, customers: 0, seats: 0 });
  g.customers += 1;
  g.seats += num(r.seats) ?? 0;
}
const regions = Object.values(byRegion).sort((a, b) => b.customers - a.customers);

const cohorts = [];
for (const cw of csv('cohort_retention.csv')) {
  if (!['2024-01', '2024-06', '2025-01', '2025-06'].includes(cw.cohort)) continue;
  const maxOffset = Math.min(12, monthsBetween(cw.cohort, latest));
  for (let k = 0; k <= maxOffset; k++) {
    const v = num(cw[`m${k}_pct`]);
    if (v !== null) cohorts.push({ cohort: cw.cohort, offset: k, retentionPct: v });
  }
}

const header = `// Meridian-derived seed data — GENERATED from docs/case-study/meridian/data/*.csv.
// Regenerate with: node scripts/gen-seed-data.mjs — do not hand-edit.
// Frozen frames for the bundled demo document (ARCHITECTURE_PLAN §3): the real, verified
// Meridian figures (generate.py, seed=20260709), sliced to the last 12 months (+ 4 cohorts).
// This is content the engine consumes as \`fixtures.*\` externals — not code.

import type { Row } from '../stdlib/types.ts';

`;
const emit = (name, rows) => `export const ${name}: Row[] = ${JSON.stringify(rows, null, 2)};\n\n`;
writeFileSync(
  OUT,
  header +
    `export const latestMonth = ${JSON.stringify(latest)};\n\n` +
    emit('execSummary', last12) +
    emit('mrrMovements', mov) +
    emit('regionCustomers', regions) +
    emit('cohortRetention', cohorts) +
    emit('targets', csv('targets.csv').slice(-12).map((r) => ({ month: r.month, mrrBase: Math.round(num(r.mrr_base)) }))),
);
console.log('wrote', OUT, { exec: last12.length, mov: mov.length, regions: regions.length, cohorts: cohorts.length, latest });
