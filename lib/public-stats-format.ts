// Pure half of lib/public-stats.ts. It lives in its own file for exactly one
// reason: `npm test` runs node --experimental-strip-types, which cannot resolve
// `next/cache` (verified: ERR_MODULE_NOT_FOUND), so a test can never import the
// cached data module. Zero imports here, so tests/public-stats-format.test.ts
// can import it with the .ts extension the runner requires.

export type PublicStats = {
  /** ATS endpoints the scanner polls (scripts/endpoints.json length). */
  boardsWatched: number | null;
  companies: number | null;
  openRoles: number | null;
  addedLast24h: number | null;
};

export const EMPTY_STATS: PublicStats = {
  boardsWatched: null,
  companies: null,
  openRoles: null,
  addedLast24h: null,
};

/** Round down/up to the nearest 10 — "999 boards" is a precision we can't honestly claim. */
export function roundToTen(value: number): number {
  return Math.round(value / 10) * 10;
}

/**
 * A stat tile's rendered string. A null/non-finite count renders "n/a" so the
 * landing degrades to a dash instead of a 500 when the DB blinks.
 * `approx` rounds to the nearest 10 and prefixes "~".
 */
export function formatStat(value: number | null | undefined, approx = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  const n = approx ? roundToTen(value) : value;
  return `${approx ? "~" : ""}${n.toLocaleString("en-US")}`;
}
