// Shell B integration + shell C wiring (ARCHITECTURE_PLAN §2.1, §4, §7) — ties the pure spine
// to the render surface: load a document → run the **worker-backed** engine → parse the
// template → hand the renderer a `Bindings` adapter over the engine's results.
//
// The engine is now the `AsyncEngine`: formula execution happens in a terminable, `lockdown()`-ed
// SES Web Worker (`src/entry/engine.ts`), so a runaway formula is contained by the host watchdog
// rather than wedging the UI thread. Where a real `Worker` is unavailable (SSR/tests) it falls
// back to an in-process transport — same orchestration, main-thread execution.
//
// `sessionBindings` is the engine adapter the renderer resolves through (the render side is
// unit-tested against a hand-built port, so this stays a thin adapter). Params close the
// interaction loop: a widget write updates the external, calls the engine's async `update`, and
// re-renders when the pass settles.

import { AsyncEngine } from '../engine/asyncEngine.ts';
import { workerTransport, inMemoryTransport } from '../engine/workerTransport.ts';
import type { WorkerTransport } from '../engine/workerTransport.ts';
import type { ExternalValue } from '../engine/types.ts';
import type { Tier } from '../engine/tier.ts';
import { loadDocument } from '../document/loader.ts';
import { validateExternalReferences } from '../document/xref.ts';
import type { ExternalReference } from '../document/xref.ts';
import type { DocumentDiagnostic, LoadedDocument } from '../document/types.ts';
import { WIDGETS } from '../report/catalog.ts';
import { parseTemplate } from '../report/parse/mdx.ts';
import type { TemplateNode } from '../report/nodes.ts';
import { missing } from '../report/render/bindings.ts';
import type { Bindings, BoundValue } from '../report/render/bindings.ts';
import type { Value } from '../stdlib/types.ts';
import { memoryReader } from './memoryReader.ts';
import { SEED_FILES, SEED_ROOT } from '../seed/document.ts';
import { DEMO_FEED_NAME } from './demoFeed.ts';

const EXTERNAL_NAMESPACES = ['feeds.', 'fixtures.', 'static.', 'params.'];
const TIERS: ReadonlySet<string> = new Set(['static', 'pulled', 'live']);

export interface ReportSession {
  engine: AsyncEngine;
  /** Live external inputs (fixtures + params), keyed by dotted binding name. */
  externals: Record<string, ExternalValue>;
  nodes: TemplateNode[];
  title: string;
  diagnostics: DocumentDiagnostic[];
}

function normTier(tag: string | undefined): Tier {
  return tag !== undefined && TIERS.has(tag) ? (tag as Tier) : 'static';
}

/** Assemble the engine's externals from the document's fixtures + manifest param defaults. */
function assembleExternals(loaded: LoadedDocument): Record<string, ExternalValue> {
  const externals: Record<string, ExternalValue> = {};
  for (const fx of loaded.fixtures) {
    externals[`fixtures.${fx.name}`] = { value: fx.frame.rows as Value, tier: normTier(fx.frame.tier) };
  }
  for (const [name, value] of Object.entries(loaded.manifest.params)) {
    externals[`params.${name}`] = { value, tier: 'static' };
  }
  return externals;
}

/**
 * The engine's worker transport: a real module Web Worker (off-main-thread, `lockdown()`-ed)
 * under real module semantics (`vite` dev + build), else the in-process fallback.
 *
 * The worker's URL lives in `./workerUrl.ts` behind `import.meta.url` — a web standard, but
 * one immediately.run cannot yet evaluate: the platform transpiles app source ESM→CommonJS
 * and runs it as a classic script, where `import.meta` is a **parse-time** SyntaxError. That
 * module is therefore reached only via a dynamic `import()` inside this try/catch, so on the
 * platform the failure is *catchable* and the in-process transport takes over (same engine,
 * main-thread) instead of the whole app dying at module load. When the platform learns
 * `import.meta.url` (roadmap: the sandbox transpiler shim), nothing here needs to change.
 */
export async function makeTransport(
  loadWorkerUrl: () => Promise<{ ENGINE_WORKER_URL: URL }> = () => import('./workerUrl.ts'),
): Promise<WorkerTransport> {
  if (typeof Worker !== 'undefined') {
    try {
      const { ENGINE_WORKER_URL } = await loadWorkerUrl();
      return workerTransport(() => new Worker(ENGINE_WORKER_URL, { type: 'module' }));
    } catch {
      /* classic-script semantics (immediately.run) — fall through to the in-process transport */
    }
  }
  return inMemoryTransport();
}

/** The param names the template's input widgets can set (a `name`d widget declares one). */
function widgetParamNames(nodes: readonly TemplateNode[]): Set<string> {
  const names = new Set<string>();
  const walk = (list: readonly TemplateNode[]): void => {
    for (const n of list) {
      if (n.type === 'component') {
        if (WIDGETS.has(n.name) && n.attrs.name?.kind === 'literal' && typeof n.attrs.name.value === 'string') {
          names.add(n.attrs.name.value);
        }
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return names;
}

/**
 * Cross-reference diagnostics for a loaded document + the workbook the engine built from
 * it: every worksheet external checked against what the document (and the running app)
 * can supply. Exported for unit tests; `buildReportSession` wires it.
 */
export function xrefDiagnostics(
  loaded: LoadedDocument,
  references: readonly ExternalReference[],
  nodes: readonly TemplateNode[],
  runtimeFeeds: readonly string[] = [],
): DocumentDiagnostic[] {
  return validateExternalReferences(references, {
    feeds: new Set([...loaded.feeds.map((f) => f.name), ...runtimeFeeds]),
    fixtures: new Set(loaded.fixtures.map((f) => f.name)),
    params: new Set([...Object.keys(loaded.manifest.params), ...widgetParamNames(nodes)]),
    worksheetPaths: Object.fromEntries(loaded.worksheets.map((w) => [w.name, w.path])),
  });
}

/** Load the bundled demo document and run the full cold pipeline through the worker engine. */
export async function buildReportSession(transport?: WorkerTransport): Promise<ReportSession> {
  const t = transport ?? (await makeTransport());
  const loaded = await loadDocument(memoryReader(SEED_FILES), SEED_ROOT);

  const worksheetSources: Record<string, string> = {};
  for (const w of loaded.worksheets) worksheetSources[w.name] = w.source;

  const engine = await AsyncEngine.fromSources(worksheetSources, { transport: t });
  const externals = assembleExternals(loaded);
  await engine.run(externals);

  const template = loaded.templates.find((t) => t.name === 'weekly') ?? loaded.templates[0];
  const nodes = template === undefined ? [] : parseTemplate(template.source);

  // Cross-reference validation: the demo feed is app-supplied runtime infra, not a document
  // feed, so it counts as available here (and only here — a document-internal check, like
  // fixture provenance, would rightly not see it).
  const diagnostics = [
    ...loaded.diagnostics,
    ...xrefDiagnostics(loaded, engine.externalReferences(), nodes, [DEMO_FEED_NAME]),
  ];

  return { engine, externals, nodes, title: loaded.manifest.title ?? 'Reckoner report', diagnostics };
}

/** The engine adapter the renderer resolves `source` bindings through. */
export function sessionBindings(session: ReportSession, onChange: () => void): Bindings {
  return {
    resolve(source): BoundValue {
      if (EXTERNAL_NAMESPACES.some((ns) => source.startsWith(ns))) {
        const ext = session.externals[source];
        return ext === undefined ? missing(source) : { value: ext.value, tier: ext.tier, status: 'ok' };
      }
      const err = session.engine.error(source);
      if (err !== undefined) return { value: null, tier: 'live', status: 'error', message: err };
      const result = session.engine.result(source);
      return result === undefined ? missing(source) : { value: result.value, tier: result.tier, status: 'ok' };
    },
    setParam(name, value) {
      const key = `params.${name}`;
      const ext: ExternalValue = { value, tier: 'static' };
      session.externals[key] = ext;
      // The engine recomputes off the main thread; re-render when the pass settles.
      void session.engine.update({ [key]: ext }).then(onChange);
    },
  };
}
