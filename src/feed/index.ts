// The feed data-plane core (ARCHITECTURE_PLAN §5) — the pure, offline-testable half of the live
// plane: content-addressed frames, the connector's retention buffer (`keepLast`/`keepFor` + gap
// markers), keep-latest conflation (shared by feeds and param drags, §5.3 F8), and the static
// buffer≥window coverage check. The `FeedRuntime` publishes each feed twice into the engine:
// the snapshot (`feeds.<name>`, the newest frame's rows) and the retained rows
// (`feedBuffers.<name>`), which the engine's input resolver slices for `{ feed, window }`
// inputs (see `src/engine/resolve.ts`). The effectful half — the real connector realm
// (scheduled/subscription fetch via the host SSRF proxy) and the OPFS materialize-to-mount
// transport — plugs into these as injected ports in a later increment (platform-blocked).

export { frame, gapFrame } from './frame.ts';
export type { Frame } from './frame.ts';
export { RetentionBuffer } from './buffer.ts';
export type { RetentionPolicy } from './buffer.ts';
export { Conflator } from './conflation.ts';
export { checkBufferCoversWindows } from './constraints.ts';
export type { CoverageViolation, WindowDecl } from './constraints.ts';
export { manualConnector, pollingConnector } from './connector.ts';
export type { Connector, ConnectorSink, PollingOptions } from './connector.ts';
export { FeedRuntime } from './runtime.ts';
export type { FeedSpec, FeedEngine, FeedRuntimeDeps } from './runtime.ts';
