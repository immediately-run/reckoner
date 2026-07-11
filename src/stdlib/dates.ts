// Pure date helpers (ARCHITECTURE_PLAN §3.2, DSL-5). Explicit and timezone-safe: no
// ambient clock — the current time is always a declared `params.now` input passed in
// here, never read from the environment. Inputs are ISO date strings ("YYYY",
// "YYYY-MM", "YYYY-MM-DD") or `Date` objects (read in UTC); outputs are plain strings
// so a formula's result stays JSON-ish and hashable.

import type { Value } from './types.ts';

export type DateInput = string | Date;

interface Ymd {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
  hasDay: boolean;
  hasMonth: boolean;
}

const ISO = /^(\d{4})(?:-(\d{2}))(?:-(\d{2}))?$|^(\d{4})$/;

function parse(date: DateInput): Ymd {
  if (date instanceof Date) {
    return {
      y: date.getUTCFullYear(),
      m: date.getUTCMonth() + 1,
      d: date.getUTCDate(),
      hasDay: true,
      hasMonth: true,
    };
  }
  const match = ISO.exec(date);
  if (!match) throw new Error(`Invalid date: ${JSON.stringify(date)}`);
  if (match[4] !== undefined) {
    return { y: Number(match[4]), m: 1, d: 1, hasDay: false, hasMonth: false };
  }
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: match[3] !== undefined ? Number(match[3]) : 1,
    hasDay: match[3] !== undefined,
    hasMonth: true,
  };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const pad4 = (n: number): string => String(n).padStart(4, '0');

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

const monthOf = (p: Ymd): string => `${pad4(p.y)}-${pad2(p.m)}`;
const dayOf = (p: Ymd): string => `${monthOf(p)}-${pad2(p.d)}`;

/** The "YYYY-MM" month key for a date — the canonical group key for monthly rollups. */
export function monthKey(date: DateInput): string {
  return monthOf(parse(date));
}

/** Truncate a date to the start of its year, month, or day, as a normalized string. */
export function truncate(date: DateInput, unit: 'year' | 'month' | 'day'): string {
  const p = parse(date);
  if (unit === 'year') return pad4(p.y);
  if (unit === 'month') return monthOf(p);
  return dayOf(p);
}

/**
 * Shift a date by whole months, preserving the input's granularity: a month key in →
 * a month key out; a full date in → a full date out with the day clamped to the target
 * month's length (Jan 31 + 1 month → Feb 28/29).
 */
export function addMonths(date: DateInput, n: number): string {
  const p = parse(date);
  const total = p.y * 12 + (p.m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  if (!p.hasDay) {
    return p.hasMonth ? `${pad4(ny)}-${pad2(nm)}` : pad4(ny);
  }
  const nd = Math.min(p.d, daysInMonth(ny, nm));
  return `${pad4(ny)}-${pad2(nm)}-${pad2(nd)}`;
}

/** Shift a date by whole days; always returns a full "YYYY-MM-DD" string. */
export function addDays(date: DateInput, n: number): string {
  const p = parse(date);
  const t = Date.UTC(p.y, p.m - 1, p.d) + n * 86_400_000;
  const dt = new Date(t);
  return `${pad4(dt.getUTCFullYear())}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Whole calendar months from `a` to `b` (positive when `b` is later). */
export function monthsBetween(a: DateInput, b: DateInput): number {
  const pa = parse(a);
  const pb = parse(b);
  return (pb.y * 12 + pb.m) - (pa.y * 12 + pa.m);
}

export interface FiscalPeriod extends Record<string, Value> {
  fiscalYear: number;
  quarter: number;
  label: string;
}

/**
 * The fiscal year and quarter of a date, for a fiscal year that begins in
 * `startMonth` (1..12, default 1 = calendar year). The fiscal year is labeled by the
 * calendar year of its first month, so with `startMonth: 4`, Mar 2026 is FY2025 Q4 and
 * Apr 2026 is FY2026 Q1.
 */
export function fiscalPeriod(date: DateInput, opts: { startMonth?: number } = {}): FiscalPeriod {
  const start = opts.startMonth ?? 1;
  const p = parse(date);
  const monthsIn = (p.m - start + 12) % 12;
  const fiscalYear = p.m >= start ? p.y : p.y - 1;
  const quarter = Math.floor(monthsIn / 3) + 1;
  return { fiscalYear, quarter, label: `FY${fiscalYear} Q${quarter}` };
}

export interface DateRange extends Record<string, Value> {
  start: string;
  end: string;
}

/**
 * Resolve a relative range spec against an explicit `now` into an inclusive
 * "YYYY-MM-DD" `{ start, end }`. Supported: `last-Nd` (the N calendar days ending on
 * `now`), `last-Nm` (the N whole calendar months ending in `now`'s month), `ytd`,
 * `mtd`, `qtd` (calendar-quarter-to-date). Unknown specs throw — there is no silent
 * fallback that would fetch a surprising window.
 */
export function resolveRange(spec: string, now: DateInput): DateRange {
  const p = parse(now);
  const end = dayOf(p);

  const days = /^last-(\d+)d$/.exec(spec);
  if (days) return { start: addDays(now, -(Number(days[1]) - 1)), end };

  const months = /^last-(\d+)m$/.exec(spec);
  if (months) {
    const firstOfThisMonth = `${monthOf(p)}-01`;
    const start = `${addMonths(firstOfThisMonth, -(Number(months[1]) - 1))}`;
    return { start, end };
  }

  if (spec === 'ytd') return { start: `${pad4(p.y)}-01-01`, end };
  if (spec === 'mtd') return { start: `${monthOf(p)}-01`, end };
  if (spec === 'qtd') {
    const qStartMonth = Math.floor((p.m - 1) / 3) * 3 + 1;
    return { start: `${pad4(p.y)}-${pad2(qStartMonth)}-01`, end };
  }

  throw new Error(`Unknown range spec: ${JSON.stringify(spec)}`);
}
