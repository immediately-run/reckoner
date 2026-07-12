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
import type { DocumentDiagnostic, LoadedDocument } from '../document/types.ts';
import { parseTemplate } from '../report/parse/mdx.ts';
import type { TemplateNode } from '../report/nodes.ts';
import { missing } from '../report/render/bindings.ts';
import type { Bindings, BoundValue } from '../report/render/bindings.ts';
import type { Value } from '../stdlib/types.ts';
import { memoryReader } from './memoryReader.ts';
import { SEED_FILES, SEED_ROOT } from '../seed/document.ts';

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
 * when available, else the in-process fallback. The `new URL(..., import.meta.url)` Worker form
 * is a web standard (not a bundler macro), so it works on `vite` and immediately.run alike.
 */
export function makeTransport(): WorkerTransport {
  if (typeof Worker !== 'undefined') {
    try {
      return workerTransport(() => new Worker(new URL('../entry/engine.ts', import.meta.url), { type: 'module' }));
    } catch {
      /* fall through to the in-process transport */
    }
  }
  return inMemoryTransport();
}

/** Load the bundled demo document and run the full cold pipeline through the worker engine. */
export async function buildReportSession(transport: WorkerTransport = makeTransport()): Promise<ReportSession> {
  const loaded = await loadDocument(memoryReader(SEED_FILES), SEED_ROOT);

  const worksheetSources: Record<string, string> = {};
  for (const w of loaded.worksheets) worksheetSources[w.name] = w.source;

  const engine = await AsyncEngine.fromSources(worksheetSources, { transport });
  const externals = assembleExternals(loaded);
  await engine.run(externals);

  const template = loaded.templates.find((t) => t.name === 'weekly') ?? loaded.templates[0];
  const nodes = template === undefined ? [] : parseTemplate(template.source);

  return { engine, externals, nodes, title: loaded.manifest.title ?? 'Reckoner report', diagnostics: loaded.diagnostics };
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
