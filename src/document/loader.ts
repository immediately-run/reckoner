// Load a Reckoner document directory (ARCHITECTURE_PLAN §3). Reads through an injected
// {@link DocumentReader} port so it is testable with an in-memory map and works over the
// platform `fs` in the app. The manifest is fatal (a document with no valid `reckoner.json`
// cannot load); a malformed individual feed/fixture/worksheet degrades to a diagnostic and
// is skipped, so one bad file never sinks the whole document. Worksheet and template
// *source* is returned as raw text — executing it (engine) and rendering it (safe renderer)
// are other realms' jobs.

import type {
  DocumentDiagnostic,
  DocumentReader,
  FeedFile,
  FixtureFile,
  LoadedDocument,
  SourceFile,
} from './types.ts';
import { parseJson } from './internal.ts';
import { parseManifest } from './manifest.ts';
import { parseFeedConfig } from './feeds.ts';
import { parseFixtureFrame } from './fixtures.ts';

const WORKSHEET_SUFFIX = '.sheet.js';
const TEMPLATE_SUFFIX = '.mdx';
const FEED_SUFFIX = '.feed.json';
const FIXTURE_SUFFIX = '.frame.json';

/** Load and validate the document rooted at `root`. */
export async function loadDocument(reader: DocumentReader, root: string): Promise<LoadedDocument> {
  const diagnostics: DocumentDiagnostic[] = [];

  const manifestPath = join(root, 'reckoner.json');
  const manifestText = await reader.readFile(manifestPath);
  const manifest = parseManifest(parseJson(manifestText, 'reckoner.json'));

  const worksheets = await loadWorksheets(reader, root, manifest.worksheets, diagnostics);
  const templates = await loadTemplates(reader, root, diagnostics);
  const feeds = await loadFeeds(reader, root, diagnostics);
  const fixtures = await loadFixtures(reader, root, diagnostics);

  if (manifest.worksheets.length === 0) {
    diagnostics.push({ severity: 'warning', file: 'reckoner.json', message: 'document declares no worksheets.' });
  }

  return { root, manifest, worksheets, templates, feeds, fixtures, diagnostics };
}

async function loadWorksheets(
  reader: DocumentReader,
  root: string,
  order: string[],
  diagnostics: DocumentDiagnostic[],
): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (const entry of order) {
    const file = entry.endsWith(WORKSHEET_SUFFIX) ? entry : `${entry}${WORKSHEET_SUFFIX}`;
    const rel = join('worksheets', file);
    try {
      const source = await reader.readFile(join(root, rel));
      out.push({ name: stripSuffix(file, WORKSHEET_SUFFIX), path: rel, source });
    } catch {
      diagnostics.push({ severity: 'error', file: rel, message: 'declared worksheet could not be read.' });
    }
  }
  return out;
}

async function loadTemplates(
  reader: DocumentReader,
  root: string,
  diagnostics: DocumentDiagnostic[],
): Promise<SourceFile[]> {
  const files = await listDir(reader, join(root, 'templates'), TEMPLATE_SUFFIX);
  const out: SourceFile[] = [];
  for (const file of files) {
    const rel = join('templates', file);
    try {
      const source = await reader.readFile(join(root, rel));
      out.push({ name: stripSuffix(file, TEMPLATE_SUFFIX), path: rel, source });
    } catch {
      diagnostics.push({ severity: 'error', file: rel, message: 'template could not be read.' });
    }
  }
  return out;
}

async function loadFeeds(
  reader: DocumentReader,
  root: string,
  diagnostics: DocumentDiagnostic[],
): Promise<FeedFile[]> {
  const files = await listDir(reader, join(root, 'feeds'), FEED_SUFFIX);
  const out: FeedFile[] = [];
  for (const file of files) {
    const rel = join('feeds', file);
    try {
      const config = parseFeedConfig(parseJson(await reader.readFile(join(root, rel)), rel), rel);
      out.push({ name: stripSuffix(file, FEED_SUFFIX), path: rel, config });
    } catch (e) {
      diagnostics.push({ severity: 'error', file: rel, message: (e as Error).message });
    }
  }
  return out;
}

async function loadFixtures(
  reader: DocumentReader,
  root: string,
  diagnostics: DocumentDiagnostic[],
): Promise<FixtureFile[]> {
  const files = await listDir(reader, join(root, 'fixtures'), FIXTURE_SUFFIX);
  const out: FixtureFile[] = [];
  for (const file of files) {
    const rel = join('fixtures', file);
    try {
      const frame = parseFixtureFrame(parseJson(await reader.readFile(join(root, rel)), rel), rel);
      out.push({ name: stripSuffix(file, FIXTURE_SUFFIX), path: rel, frame });
    } catch (e) {
      diagnostics.push({ severity: 'error', file: rel, message: (e as Error).message });
    }
  }
  return out;
}

/** List a directory's entries with the given suffix, sorted; a missing dir is empty, not an error. */
async function listDir(reader: DocumentReader, dir: string, suffix: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await reader.readDir(dir);
  } catch {
    return [];
  }
  return entries.filter((e) => e.endsWith(suffix)).sort();
}

function stripSuffix(file: string, suffix: string): string {
  return file.endsWith(suffix) ? file.slice(0, -suffix.length) : file;
}

function join(...parts: string[]): string {
  return parts
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, '')))
    .filter((p) => p.length > 0)
    .join('/');
}
