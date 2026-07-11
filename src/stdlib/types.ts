// Core value model for the Reckoner formula stdlib.
//
// Formulas take plain values in and return one plain value out (ARCHITECTURE_PLAN
// §3.1): JSON-ish data only — scalars, arrays, and plain objects, never class
// instances or closures. Keeping the model to plain immutable values is what makes
// early-cutoff cheap (reference-equality + content hashing, RQ-B1) and what lets the
// engine freeze inputs across the starved boundary. `null` is the single empty marker
// the shaping layer produces (§3.2 null semantics); `undefined` is treated as absent
// wherever it turns up but is never *produced* by the stdlib.

export type Scalar = string | number | boolean | null;

export type Value = Scalar | Value[] | { [key: string]: Value };

/** A record in a table: named columns to plain values. */
export type Row = Record<string, Value>;

/**
 * An aggregator collapses the rows of one group to a single value (used by
 * `rollup`). Empty / all-null groups return `null`, never `0` — 0 is a wrong
 * answer for `mean`/`median` and hides bugs behind a green fitting fixture
 * (ARCHITECTURE_PLAN §3.2 null semantics).
 */
export type Aggregator = (rows: Row[]) => Value;

/** A row predicate for `filter`. */
export type Predicate = (row: Row) => boolean;

/** A per-row projection for `derive`. */
export type Projection = (row: Row) => Value;
