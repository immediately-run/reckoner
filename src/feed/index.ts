// The feed data-plane core (ARCHITECTURE_PLAN §5) — the pure, offline-testable half of the live
// plane: content-addressed frames, the connector's retention buffer (`keepLast`/`keepFor` + gap
// markers), keep-latest conflation (shared by feeds and param drags, §5.3 F8), and the static
// buffer≥window coverage check. The effectful half — the connector realm (scheduled/subscription
// fetch via the host SSRF proxy), the OPFS materialize-to-mount transport, the change
// notification, and the engine wiring (feeds as `feeds.*` externals + the common-epoch barrier)
// — plugs into these as injected ports in a later increment.

export { frame, gapFrame } from './frame.ts';
export type { Frame } from './frame.ts';
export { RetentionBuffer } from './buffer.ts';
export type { RetentionPolicy } from './buffer.ts';
export { Conflator } from './conflation.ts';
export { checkBufferCoversWindows } from './constraints.ts';
export type { CoverageViolation, WindowDecl } from './constraints.ts';
