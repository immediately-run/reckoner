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
import type { DocumentDiagnostic, LoadedDocument, ParamRef } from '../document/types.ts';
import { resolveParamRefs, paramShadow } from '../document/paramRefs.ts';
import { REFLECTION, WIDGETS } from '../report/catalog.ts';
import { parseTemplate } from '../report/parse/mdx.ts';
import { validateTemplate } from '../report/validate.ts';
import type { TemplateNode } from '../report/nodes.ts';
import { AUTHORS_VIEW_SCAFFOLD, authorsViewName, consumerTemplate } from './authorsView.ts';
import { missing } from '../report/render/bindings.ts';
import type { Bindings, BoundValue } from '../report/render/bindings.ts';
import type { Value } from '../stdlib/types.ts';
import { memoryReader } from './memoryReader.ts';
import { fsReader } from '../document/fsReader.ts';
import { resolveWorkbookMount } from './dispatch.ts';
import type { SandboxMount } from '@immediately-run/sdk';
import { MERIDIAN_SEED, type SeedDocument } from '../seed/seeds.ts';
import { DEMO_FEED_NAME } from './demoFeed.ts';
import { USAGE_FEED_NAMES } from './usageFeeds.ts';

// Re-exported for existing import sites (the seeds themselves live in src/seed/seeds.ts).
export { CALDERA_SEED, MERIDIAN_SEED } from '../seed/seeds.ts';
export type { SeedDocument } from '../seed/seeds.ts';

const EXTERNAL_NAMESPACES = ['feeds.', 'fixtures.', 'static.', 'params.'];
const TIERS: ReadonlySet<string> = new Set(['static', 'pulled', 'live']);

export interface ReportSession {
  engine: AsyncEngine;
  /** Live external inputs (fixtures + params), keyed by dotted binding name. */
  externals: Record<string, ExternalValue>;
  /** paramRefs knobs (R3-377): name → the fixture leaf a runtime write shadows. */
  paramRefs: Record<string, ParamRef>;
  nodes: TemplateNode[];
  title: string;
  diagnostics: DocumentDiagnostic[];
  /**
   * Retained for shadow evaluation (WHATIF_SHADOW_EVALUATION_SPEC §2.2): the worksheet
   * sources the engine was built from (the splice substrate), the loaded document and the
   * runtime-feed names (the cross-reference universe the shadow build re-validates
   * against, G-WIF-10).
   */
  sources: Record<string, string>;
  loaded: LoadedDocument;
  runtimeFeeds: string[];
  /**
   * The author's-view node tree (AUTHORS_VIEW_SPEC §3.5): the document's own
   * author's-view template when it carries one, else the built-in scaffold — never
   * served as the consumer report (§4).
   */
  authorsNodes: TemplateNode[];
  /** True when `authorsNodes` came from a document file (an author took ownership). */
  authorsFromDocument: boolean;
}

function normTier(tag: string | undefined): Tier {
  return tag !== undefined && TIERS.has(tag) ? (tag as Tier) : 'static';
}

/** Assemble the engine's externals from the document's fixtures + manifest param defaults + paramRefs knobs (R3-377). Exported for the case-study harness; the app wires it via {@link buildReportSession}. */
export function assembleExternals(loaded: LoadedDocument): {
  externals: Record<string, ExternalValue>;
  paramRefs: Record<string, ParamRef>;
} {
  const externals: Record<string, ExternalValue> = {};
  for (const fx of loaded.fixtures) {
    externals[`fixtures.${fx.name}`] = { value: fx.frame.rows as Value, tier: normTier(fx.frame.tier) };
  }
  for (const [name, value] of Object.entries(loaded.manifest.params)) {
    externals[`params.${name}`] = { value, tier: 'static' };
  }
  // Assumptions-as-params: each knob's default is read from its fixture leaf and also
  // published as `params.<name>` (for template binding + the params surface).
  const { defaults, refs, diagnostics } = resolveParamRefs(loaded.manifest.paramRefs, loaded.fixtures);
  for (const [key, ext] of Object.entries(defaults)) {
    if (externals[key] === undefined) externals[key] = { value: ext.value, tier: ext.tier };
  }
  void diagnostics; // already surfaced by the loader's paramRefDiagnostics
  return { externals, paramRefs: refs };
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

/** Reflection component names used in a node tree (AUTHORS_VIEW_SPEC §6's consumer-template diagnostic). */
function reflectionComponentNames(nodes: readonly TemplateNode[]): string[] {
  const found = new Set<string>();
  const walk = (list: readonly TemplateNode[]): void => {
    for (const n of list) {
      if (n.type === 'component') {
        if (REFLECTION.has(n.name)) found.add(n.name);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return [...found];
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
    params: new Set([
      ...Object.keys(loaded.manifest.params),
      ...Object.keys(loaded.manifest.paramRefs ?? {}),
      ...widgetParamNames(nodes),
    ]),
    worksheetPaths: Object.fromEntries(loaded.worksheets.map((w) => [w.name, w.path])),
  });
}

/** Load a bundled document and run the full cold pipeline through the worker engine. */
export async function buildReportSession(
  transport?: WorkerTransport,
  seed: SeedDocument = MERIDIAN_SEED,
  mounts: readonly SandboxMount[] = [],
): Promise<ReportSession> {
  const t = transport ?? (await makeTransport());

  // The dispatched flow first: a workbook repo that arrived as a content mount
  // (R3-172 repo-load dispatch) is read from the filesystem — plain files, the same
  // `loadDocument` pipeline as the seed, no copy embedded in this app. Absent a
  // dispatched mount, the bundled seed document (optionally `?doc=`-selected).
  const dispatch = resolveWorkbookMount(mounts);
  const loaded =
    dispatch.ok
      ? await loadDocument(fsReader(), dispatch.root)
      : await loadDocument(memoryReader(seed.files), seed.root);

  const worksheetSources: Record<string, string> = {};
  for (const w of loaded.worksheets) worksheetSources[w.name] = w.source;

  const engine = await AsyncEngine.fromSources(worksheetSources, { transport: t });
  const { externals, paramRefs } = assembleExternals(loaded);
  await engine.run(externals);

  // Template roles (AUTHORS_VIEW_SPEC §4): the author's-view template — manifest-named
  // or the reserved `authors_view` — is excluded from consumer-report selection; the
  // consumer pick otherwise keeps the existing `weekly` guess. Absent an author's-view
  // file, the built-in scaffold is the default view (§1.1).
  const authorsName = authorsViewName(loaded);
  const template = consumerTemplate(loaded.templates, authorsName);
  const nodes = template === undefined ? [] : parseTemplate(template.source);
  const authorsFile = loaded.templates.find((t) => t.name === authorsName);
  const authorsNodes = parseTemplate(authorsFile?.source ?? AUTHORS_VIEW_SCAFFOLD);

  // Both trees validate against the catalog, diagnostics attributed per file (§3.5) —
  // and a reflection component in a CONSUMER template is flagged (§6): the port is
  // withheld there, so it would render the author's-view-only tile.
  const templateDiagnostics: DocumentDiagnostic[] = [];
  if (template !== undefined) {
    for (const d of validateTemplate(nodes).diagnostics) {
      templateDiagnostics.push({ severity: d.severity, file: template.path, message: `${d.component}: ${d.message}` });
    }
    for (const name of reflectionComponentNames(nodes)) {
      templateDiagnostics.push({
        severity: 'warning',
        file: template.path,
        message: `<${name}> is an author's-view component; in the report it renders as unavailable.`,
      });
    }
  }
  if (authorsFile !== undefined) {
    for (const d of validateTemplate(authorsNodes).diagnostics) {
      templateDiagnostics.push({ severity: d.severity, file: authorsFile.path, message: `${d.component}: ${d.message}` });
    }
  }

  // Cross-reference validation: the demo feed is app-supplied runtime infra, not a document
  // feed, so it counts as available here (and only here — a document-internal check, like
  // fixture provenance, would rightly not see it) — but only for the seed document that
  // reads it; a dispatched workbook never does.
  // The app-supplied runtime feeds this seed reads (absent on a dispatched mount:
  // a mounted workbook's feeds are its own, never the bundled seed's).
  const runtimeFeeds = dispatch.ok
    ? []
    : seed.demoFeed === true
      ? [DEMO_FEED_NAME]
      : seed.usageFeeds === true
        ? [...USAGE_FEED_NAMES]
        : [];
  const diagnostics = [
    ...loaded.diagnostics,
    ...templateDiagnostics,
    // The params universe spans BOTH trees (§3.5): a widget an author places in a
    // custom author's view resolves rather than false-flagging.
    ...xrefDiagnostics(loaded, engine.externalReferences(), [...nodes, ...authorsNodes], runtimeFeeds),
  ];

  return {
    engine,
    externals,
    paramRefs,
    nodes,
    title: loaded.manifest.title ?? 'Reckoner report',
    diagnostics,
    sources: worksheetSources,
    loaded,
    runtimeFeeds,
    authorsNodes,
    authorsFromDocument: authorsFile !== undefined,
  };
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
      // A paramRefs knob (R3-377) shadows its leaf INSIDE the fixture value — one
      // coherent frozen snapshot for the formulas, riding the existing externals path,
      // so exactly the cells that declared that fixture recompute.
      const ref = session.paramRefs[name];
      if (ref !== undefined) {
        const fixtureValue = session.externals[ref.from]?.value;
        if (fixtureValue !== undefined) {
          const patch = paramShadow(name, value, ref, fixtureValue);
          for (const [key, { value: v }] of Object.entries(patch)) {
            session.externals[key] = { value: v, tier: 'static' };
          }
          void session.engine.update(patch as Record<string, ExternalValue>).then(onChange);
          return;
        }
      }
      const key = `params.${name}`;
      const ext: ExternalValue = { value, tier: 'static' };
      session.externals[key] = ext;
      // The engine recomputes off the main thread; re-render when the pass settles.
      void session.engine.update({ [key]: ext }).then(onChange);
    },
  };
}
