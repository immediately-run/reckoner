// The Reckoner document model (ARCHITECTURE_PLAN §3; DOCUMENT_VERSIONING_SPEC). A
// document is plain files in a mount: `reckoner.json` (the manifest), `worksheets/`
// (formula modules — content, executed only in the engine), `feeds/` (trusted connector
// config), `fixtures/` (frozen frames), and `templates/` (non-executable MDX). These types
// are the contract between all four realms; the loader in ./loader.ts validates a document
// directory against them. The worksheet/template *source* is carried as raw text here — it
// is executed by the engine and rendered by the SDK safe renderer, never by this module.

import type { Row, Value } from '../stdlib/types.ts';

// --- reckoner.json manifest ------------------------------------------------------

/**
 * The compatibility envelope (DOCUMENT_VERSIONING_SPEC §1). Ranges are what the document
 * was authored against and needs — a lower bound with an open upper bound within the
 * major, because the stdlib and catalog are additive-only.
 */
export interface CompatBlock {
  /** Semver range for the formula stdlib the worksheets rely on, e.g. ">=1.4 <2". */
  stdlib?: string;
  /** Semver range for the template component catalog the templates rely on. */
  catalog?: string;
  /** The tier-tag encoding version (host-interpreted). */
  tierTag?: number;
}

/** Exact-version provenance, stamped by the running app — never used for resolution. */
export interface AuthoredWith {
  app?: string;
  stdlib?: string;
  catalog?: string;
}

export interface ReckonerManifest {
  /** The document-schema major. A breaking change bumps it; an app refuses a major it predates. */
  format: number;
  compat: CompatBlock;
  authoredWith?: AuthoredWith;
  /** Worksheet module basenames, in display/execution order (names, not coordinates — §3.1). */
  worksheets: string[];
  /** Param default values, keyed by param name (the `<Params>` widgets' `default`s). */
  params: Record<string, Value>;
  title?: string;
}

// --- feeds/*.feed.json (trusted connector config, §3.4) --------------------------

export interface FeedRetention {
  keepLast?: number;
  keepFor?: string;
}

export interface FeedAuth {
  /** A *reference* to a user-held secret — never a secret value (§8 credential rule). */
  secretRef: string;
}

export interface FeedConfig {
  /** Source URL(s) the connector fetches. */
  source: string | string[];
  /** `poll` on a schedule, or `subscribe` to a stream. */
  mode: 'poll' | 'subscribe';
  auth?: FeedAuth;
  /** Poll schedule (e.g. a cron/interval string), for `mode: "poll"`. */
  schedule?: string;
  retention?: FeedRetention;
  /** Conflation interval — collapse bursts to at most one frame per window. */
  conflation?: string;
}

// --- fixtures/*.frame.json (frozen frames, §3.4) ---------------------------------

export interface FixtureProvenance {
  /** The feed this frame was captured from. */
  sourceFeed?: string;
  /** ISO timestamp of capture. */
  capturedAt?: string;
  /** Who captured it. */
  captureActor?: string;
  /** Schema-derived or second-agent-authored — clean-tier by construction (RQ-D4). */
  synthetic?: boolean;
}

export interface FixtureFrame {
  rows: Row[];
  provenance: FixtureProvenance;
  /** The frame's tier tag at capture — advisory display metadata; the host mount tier is authoritative (§5.4). */
  tier?: string;
}

// --- loading ---------------------------------------------------------------------

export type DiagnosticSeverity = 'error' | 'warning';

export interface DocumentDiagnostic {
  severity: DiagnosticSeverity;
  /** The file (document-root-relative) the diagnostic is about. */
  file: string;
  message: string;
}

/** A worksheet or template file: raw source, to be executed/rendered elsewhere. */
export interface SourceFile {
  name: string;
  path: string;
  source: string;
}

export interface FeedFile {
  name: string;
  path: string;
  config: FeedConfig;
}

export interface FixtureFile {
  name: string;
  path: string;
  frame: FixtureFrame;
}

export interface LoadedDocument {
  root: string;
  manifest: ReckonerManifest;
  worksheets: SourceFile[];
  templates: SourceFile[];
  feeds: FeedFile[];
  fixtures: FixtureFile[];
  diagnostics: DocumentDiagnostic[];
}

/**
 * The filesystem port the loader reads through (§5 architecture — heavy collaborators are
 * injected). Backed by the platform `fs` in the app, or an in-memory map in tests.
 */
export interface DocumentReader {
  readFile(path: string): Promise<string>;
  readDir(path: string): Promise<string[]>;
}
