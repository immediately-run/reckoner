// The SDK's host-less fault, discriminated — ONE home (R3-754 review round 2, R6).
// The producer is the SDK's hostTransport throw (`immediately.run: no host
// transport`) and the SDK exports no discriminator, so every consumer that must
// tell the benign off-host load failure (plain `vite dev`, vitest — a silent no-op
// per DOCUMENT_NAVIGATOR_SPEC §4.1/DN-R5) from a REAL on-host fault (which must
// surface, not render the demo document with no signal) reads this predicate:
// useEditFile's refusal channel and useTaskInputLazy's poll. A per-call-site copy
// is where the bug lives — if the SDK's message ever drifts, one edit here follows
// it instead of two independent finds.

export function isNoHostTransport(e: unknown): boolean {
  const msg = (e as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && /no host transport/i.test(msg);
}
