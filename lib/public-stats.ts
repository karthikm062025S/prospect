import { unstable_cache } from "next/cache";
import endpoints from "@/scripts/endpoints.json";
import { query } from "./db";
import { EMPTY_STATS, type PublicStats } from "./public-stats-format";
import { guardedRead } from "./cache-guard";

// Server-only. The landing lives at app/welcome, OUTSIDE the (app) route group:
// these four numbers are public, aggregate, and belong to no user.

const DAY_MS = 24 * 60 * 60 * 1000;

function boardsWatchedCount(): number | null {
  return Array.isArray(endpoints) ? endpoints.length : null;
}

async function readPublicStats(): Promise<PublicStats> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  // Throw, don't swallow: unstable_cache below only caches a successful
  // resolve, so a caught-and-returned EMPTY_STATS here would get cached as if
  // the counts were genuinely zero. See lib/cache-guard.ts.
  // No hidden_at filter (fixed 2026-09-03, v7/feed lane): `roles.hidden_at`
  // is the OWNER's legacy per-user hide, superseded by `user_roles` (D3/D4).
  // Public = open, full stop.
  const [[companies], [open], [recent]] = await Promise.all([
    query<{ n: number }>("select count(*)::int as n from companies", [], "companies"),
    query<{ n: number }>("select count(*)::int as n from roles where lifecycle = 'open'", [], "roles"),
    query<{ n: number }>("select count(*)::int as n from roles where created_at >= $1", [since], "roles"),
  ]);
  return {
    boardsWatched: boardsWatchedCount(),
    companies: companies.n,
    openRoles: open.n,
    addedLast24h: recent.n,
  };
}

const cachedPublicStats = unstable_cache(readPublicStats, ["public-stats"], {
  revalidate: 1800,
  tags: ["public-stats"],
});

/**
 * Cached for 30 minutes (the scanner's own hot-board cadence). Tag: public-stats.
 * The landing must never 500 (or serve a cached failure) because the DB
 * blinked — the tiles render "—", computed fresh on every failed call.
 */
export const getPublicStats = guardedRead(
  cachedPublicStats,
  () => ({ ...EMPTY_STATS, boardsWatched: boardsWatchedCount() }),
  "public-stats",
);
