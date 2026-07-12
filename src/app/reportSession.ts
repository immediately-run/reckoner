// Shell B integration (ARCHITECTURE_PLAN §2.1, §7) — the one new piece that ties the pure
// spine to the render surface: load a document → build the SES-confined engine → run it →
// parse the template → hand the renderer a `Bindings` adapter over the engine's results.
//
// `buildReportSession` is the full cold pipeline; `sessionBindings` is the engine adapter the
// renderer resolves through (the render side is unit-tested against a hand-built port, so this
// stays a thin adapter). Params close the interaction loop: a widget write updates the external
// and calls the engine's incremental `update`, then the caller re-renders.

import { Engine } from '../engine/engine.ts';
import type { ExternalValue } from '../engine/types.ts';
import type { Tier } from '../engine/tier.ts';
import { loadDocument } from '../document/loader.ts';
import type { DocumentDiagnostic, LoadedDocument } from '../document/types.ts';
import { parseTemplate } from '../report/parse/mdx.ts';
import type { TemplateNode } from '../report/nodes.ts';
import { missing } from '../report/render/bindings.ts';
import type { Bindings, BoundValue } from '../report/render/bindings.ts';
import type { Value } from '../stdlib/types.ts';
import * as stdlib from '../stdlib/index.ts';
import { memoryReader } from './memoryReader.ts';
import { SEED_FILES, SEED_ROOT } from '../seed/document.ts';

const EXTERNAL_NAMESPACES = ['feeds.', 'fixtures.', 'static.', 'params.'];
const TIERS: ReadonlySet<string> = new Set(['static', 'pulled', 'live']);

export interface ReportSession {
  engine: Engine;
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

/** Load the bundled demo document and run the full cold pipeline. */
export async function buildReportSession(): Promise<ReportSession> {
  const loaded = await loadDocument(memoryReader(SEED_FILES), SEED_ROOT);

  const worksheetSources: Record<string, string> = {};
  for (const w of loaded.worksheets) worksheetSources[w.name] = w.source;

  const engine = Engine.fromSources(worksheetSources, { ...stdlib });
  const externals = assembleExternals(loaded);
  engine.run(externals);

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
      try {
        const result = session.engine.scheduler.result(source);
        return result === undefined ? missing(source) : { value: result.value, tier: result.tier, status: 'ok' };
      } catch (e) {
        return { value: null, tier: 'live', status: 'error', message: (e as Error).message };
      }
    },
    setParam(name, value) {
      const key = `params.${name}`;
      const update: ExternalValue = { value, tier: 'static' };
      session.externals[key] = update;
      session.engine.update({ [key]: update });
      onChange();
    },
  };
}
