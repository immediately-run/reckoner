// Categorical + sequential color for charts (§3.3.1 "accessible color built into the
// components, not author decisions"). Colors are the design-system accent family, ordered for
// adjacent-hue separation; series map by index. Author templates never choose colors — the
// catalog owns them, so a report stays legible and on-brand across forks. Pure.

/** Categorical series palette (brand accents, hue-separated). Cycles past its length. */
const CATEGORICAL = [
  '#f49ad4', // brand pink
  '#b285f2', // violet
  '#7cc7ff', // sky
  '#8ef0c8', // mint
  '#ffd479', // amber
  '#ff9a8e', // coral
  '#c9a7ff', // lilac
  '#6fe0d6', // teal
] as const;

export function seriesColor(index: number): string {
  return CATEGORICAL[((index % CATEGORICAL.length) + CATEGORICAL.length) % CATEGORICAL.length];
}

export const categoricalPalette: readonly string[] = CATEGORICAL;

/**
 * A sequential fill for a magnitude in `[0,1]` (choropleth / heat). Interpolates violet→pink
 * through the brand accents; `t` outside `[0,1]` is clamped.
 */
export function sequentialColor(t: number): string {
  const c = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const from = [82, 55, 122]; // deep violet
  const to = [244, 154, 212]; // brand pink
  const ch = (i: number): number => Math.round(from[i] + (to[i] - from[i]) * c);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}
