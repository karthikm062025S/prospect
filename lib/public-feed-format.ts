// Pure half of lib/public-feed.ts (same split, same reason as
// lib/public-stats-format.ts): `npm test` runs node --experimental-strip-types,
// which cannot resolve `next/cache`, so the cached data module can never be
// imported by a test. Only TYPE imports here — a lib->lib VALUE import breaks
// the same runner (see lib/sort.ts's note), and types are erased before it runs.

import type { Family } from "./family";
import type { Season } from "./season";

/** One row of the signed-out landing feed. Deliberately the public column set:
 *  no notes, no priority, no fit, no per-user state. */
export type FeedRow = {
  id: string;
  company: string;
  title: string;
  season: Season;
  family: Family;
  location: string | null;
  /** Sanitized posting URL, or null when the stored link is not http(s). */
  href: string | null;
  /** Rendered on the SERVER ("2h ago"). A client-side Date.now() would disagree
   *  with the server's and produce a hydration text mismatch on every row. */
  added: string;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * How long ago Scout found the posting. Elapsed time, not calendar days: this
 * band is about the last few hours, where "today" is not information.
 * A future timestamp (clock skew) reads "just now", never a negative count.
 */
export function relativeAdded(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const ms = Math.max(0, nowMs - then);
  if (ms < HOUR) return "just now";
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  const days = Math.floor(ms / DAY);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/** The cached shape: a raw timestamp instead of a pre-rendered "2h ago"
 *  string. unstable_cache (lib/public-feed.ts) freezes whatever a cached
 *  function returns for the whole revalidate window, longer still if
 *  revalidation keeps failing - so a string baked in at cache-write time
 *  goes stale and can end up shown as if it were live. `added` is computed
 *  fresh on every call instead, by withFreshAdded below, OUTSIDE the cache
 *  boundary. */
export type FeedRowRaw = Omit<FeedRow, "added"> & { createdAt: string };

/** Turns cached rows back into FeedRows, computing `added` from `createdAt`
 *  at call time so it always reflects the real elapsed time, never the
 *  moment the cache was last written. Pure: no cache, no DB, unit-testable. */
export function withFreshAdded(rows: FeedRowRaw[], nowMs: number = Date.now()): FeedRow[] {
  return rows.map(({ createdAt, ...rest }) => ({ ...rest, added: relativeAdded(createdAt, nowMs) }));
}

// ---------------------------------------------------------------------------
// v8 D12: company drops. Karthik's finding — when one company posts 25 roles in
// a morning, a flat "24 newest" list is 24 rows of that ONE company and the
// feed stops telling a visitor anything. Two pure pieces fix it: a summary of
// who dropped a batch this week (rendered above the list) and a per-company cap
// on the list itself.

const WEEK = 7 * DAY;

/** One row of the drop query: the public column set, nothing per-user. */
export type DropInput = { company: string; title: string; createdAt: string };

/** A company that posted a batch in the last week. */
export type CompanyDrop = {
  company: string;
  count: number;
  /** ISO timestamp of that company's newest role in the window. */
  newestAt: string;
  /** Rendered on the SERVER, same reason as FeedRow.added: a client-side
   *  Date.now() would disagree with the server's and mismatch on hydration. */
  added: string;
  /** Up to 2 titles, newest first, to show what the batch actually is. */
  sample: string[];
};

/** Minimum roles in the window before a company counts as a "drop". Two roles
 *  is a Tuesday; three is a batch worth a card. */
const DROP_MIN = 3;
/** The strip is a glance, not a second feed. */
const DROP_MAX = 6;

/**
 * Group the last week's rows into up to six company drops, biggest first.
 * Pure so the threshold, the window and the ordering are unit-testable without
 * a database (lib/public-feed.ts cannot be imported by `npm test` — it pulls
 * next/cache; see the header of this file).
 */
export function groupDrops(rows: DropInput[], nowMs: number): CompanyDrop[] {
  const cutoff = nowMs - WEEK;
  const byCompany = new Map<string, { count: number; titles: { title: string; ms: number }[] }>();

  for (const row of rows) {
    const ms = new Date(row.createdAt).getTime();
    // Outside the window, or an unparseable timestamp: not a drop.
    if (Number.isNaN(ms) || ms < cutoff) continue;
    const entry = byCompany.get(row.company) ?? { count: 0, titles: [] };
    entry.count += 1;
    entry.titles.push({ title: row.title, ms });
    byCompany.set(row.company, entry);
  }

  return [...byCompany.entries()]
    .filter(([, entry]) => entry.count >= DROP_MIN)
    .map(([company, entry]) => {
      // The input is not guaranteed sorted, so newest-first is derived here.
      const titles = [...entry.titles].sort((a, b) => b.ms - a.ms);
      const newest = titles[0];
      return {
        company,
        count: entry.count,
        newestAt: new Date(newest.ms).toISOString(),
        added: relativeAdded(new Date(newest.ms).toISOString(), nowMs),
        sample: titles.slice(0, 2).map((t) => t.title),
      };
    })
    .sort((a, b) => b.count - a.count || Date.parse(b.newestAt) - Date.parse(a.newestAt))
    .slice(0, DROP_MAX);
}

/**
 * Keep at most `cap` rows per company, in the original order, and report how
 * many each company had left over. The leftovers are not dropped from the
 * product — the caller renders them behind a "+N more from X" line — they are
 * just not allowed to own the visible list.
 */
export function capPerCompany<T extends { company: string }>(
  rows: T[],
  cap = 3,
): { rows: T[]; collapsed: Map<string, number> } {
  const seen = new Map<string, number>();
  const collapsed = new Map<string, number>();
  const kept: T[] = [];

  for (const row of rows) {
    const nth = (seen.get(row.company) ?? 0) + 1;
    seen.set(row.company, nth);
    if (nth <= cap) kept.push(row);
    else collapsed.set(row.company, (collapsed.get(row.company) ?? 0) + 1);
  }

  return { rows: kept, collapsed };
}
