// The Reckoner document model (ARCHITECTURE_PLAN §3; DOCUMENT_VERSIONING_SPEC).
//
// Types + pure validators for the document's plain files (`reckoner.json`, feeds,
// fixtures), a filesystem-port loader that assembles a `LoadedDocument` with diagnostics,
// and the version-compatibility resolution rule. Worksheet/template *source* is carried as
// raw text — executing it (the SES engine) and rendering it (the SDK safe renderer) are
// other realms' jobs.
//
// Deferred (tracked, follow-up): host-side `compat` derivation by static analysis of
// worksheet imports / template component uses at save time (DOCUMENT_VERSIONING §1 — this
// module validates and resolves an *existing* envelope; deriving it is a save-time host
// feature), and cross-reference validation (a worksheet input naming a missing feed/fixture,
// a fixture's `sourceFeed` naming a missing feed).

export type {
  AuthoredWith,
  CompatBlock,
  DiagnosticSeverity,
  DocumentDiagnostic,
  DocumentReader,
  FeedAuth,
  FeedConfig,
  FeedFile,
  FeedRetention,
  FixtureFile,
  FixtureFrame,
  FixtureProvenance,
  LoadedDocument,
  ReckonerManifest,
  SourceFile,
} from './types.ts';

export { parseManifest } from './manifest.ts';
export { parseFeedConfig } from './feeds.ts';
export { parseFixtureFrame } from './fixtures.ts';
export { loadDocument } from './loader.ts';
export { resolveCompat } from './compat.ts';
export type { AppVersions, CompatVerdict } from './compat.ts';
export { compareVersions, parseVersion, satisfies } from './semver.ts';
export type { SemVer } from './semver.ts';
