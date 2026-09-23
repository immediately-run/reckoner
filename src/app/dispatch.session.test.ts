// The dispatched session over the filesystem port: a workbook written to a temp dir
// (the DCF notebook's minimal shape) is mounted as `type: 'content'`, and
// buildReportSession must open it — the same loader/engine/template pipeline as the
// seed, zero embedded copy — while the seed fallback stays untouched when no content
// mount exists.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReportSession } from './reportSession.ts';
import { inMemoryTransport } from '../engine/workerTransport.ts';
import type { SandboxMount } from '@immediately-run/sdk';
import type { TaskInput } from '@immediately-run/sdk/tasks';

const MANIFEST = JSON.stringify({
  format: 1,
  compat: { stdlib: '>=0.1.0', catalog: '>=0.1.0' },
  worksheets: ['model'],
  title: 'Mounted workbook',
});
const WORKSHEET = `import { cell } from "@reckoner/stdlib";
export const headline = cell({ doc: "the headline", inputs: { rows: "fixtures.data" }, formula: ({ rows }) => rows.reduce((a, r) => a + r.v, 0) });
`;
const FIXTURE = JSON.stringify({ rows: [{ v: 1 }, { v: 2 }, { v: 3 }], provenance: { synthetic: true } });
const TEMPLATE = `# Mounted.\n\n<Kpi source="model.headline" format="number" />`;

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'reckoner-wb-'));
  await mkdir(join(root, 'worksheets'), { recursive: true });
  await mkdir(join(root, 'fixtures'), { recursive: true });
  await mkdir(join(root, 'templates'), { recursive: true });
  await writeFile(join(root, 'reckoner.json'), MANIFEST, 'utf8');
  await writeFile(join(root, 'worksheets', 'model.sheet.js'), WORKSHEET, 'utf8');
  await writeFile(join(root, 'fixtures', 'data.frame.json'), FIXTURE, 'utf8');
  await writeFile(join(root, 'templates', 'summary.mdx'), TEMPLATE, 'utf8');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const contentMount = (path: string): SandboxMount[] =>
  [{ id: 'wb', path, type: 'content', mode: 'ro' }] as unknown as SandboxMount[];

describe('buildReportSession over a dispatched content mount', () => {
  it('opens the mounted workbook through the fs reader: title, cells, template, values', async () => {
    const session = await buildReportSession(inMemoryTransport(), undefined, contentMount(root));
    expect(session.title).toBe('Mounted workbook');
    expect(session.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(session.nodes.length).toBeGreaterThan(0);
    expect(session.engine.value('model.headline')).toBe(6);
    // the demo feed is a SEED concern — a dispatched workbook never reads it
    expect(session.paramRefs).toEqual({});
  });

  it('without a content mount, the seed document loads exactly as before', async () => {
    const session = await buildReportSession(inMemoryTransport(), undefined, []);
    expect(session.title).toBe('Meridian — monthly review');
  });
});

// The R3-754 join: the task-invocation shape reaches buildReportSession through the
// task INPUT — the delegation mount alone is not a dispatch (its mark is keyed on the
// input, never guessed). `dir` here is the temp root itself: the resolution matches
// `params.dir` against the delegation's path exactly as the host's rewritten chroot
// path matched it live (`/task/<slot>/dir` — the probed spelling is pinned in
// dispatch.test.ts); what this file proves is the plumbing: taskInput flows through
// the session builder and the workbook at that path loads through the same pipeline.
const taskDelegation = (dir: string): SandboxMount[] =>
  [{ id: dir, path: dir, type: 'task-delegation', mode: 'ro' }] as unknown as SandboxMount[];

describe('buildReportSession over the task-invocation shape (R3-754)', () => {
  const input = (task: string, dir: string): TaskInput => ({ task, params: { dir } }) as TaskInput;

  it('the task input + its delegation mount open the mounted workbook — the join the dispatch lives on', async () => {
    const session = await buildReportSession(
      inMemoryTransport(),
      undefined,
      taskDelegation(root),
      input('open-workbook', root),
    );
    expect(session.title).toBe('Mounted workbook');
    expect(session.engine.value('model.headline')).toBe(6);
  });

  it('an input for ANOTHER task is not a dispatch — the seed loads, the delegation is not guessed at', async () => {
    const session = await buildReportSession(
      inMemoryTransport(),
      undefined,
      taskDelegation(root),
      input('edit-table', root),
    );
    expect(session.title).toBe('Meridian — monthly review');
  });

  it('without the input, a lone task-delegation mount is not a dispatch either', async () => {
    const session = await buildReportSession(inMemoryTransport(), undefined, taskDelegation(root));
    expect(session.title).toBe('Meridian — monthly review');
  });
});
