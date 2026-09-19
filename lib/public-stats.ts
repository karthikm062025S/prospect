import { unstable_cache } from "next/cache";
import endpoints from "@/scripts/endpoints.json";
import { createServiceClient } from "./supabase/service";
import { EMPTY_STATS, type PublicStats } from "./public-stats-format";
import { guardedRead } from "./cache-guard";

// Server-only. The landing lives at app/welcome, OUTSIDE the (app) route group,
// so it is exempt from the V1 structural rule that bans lib/supabase/service
// under app/(app)/**: these four numbers are public, aggregate, and belong to no
// user, and reading them with the anon client would need a signed-in session the
// visitor does not have.

const DAY_MS = 24 * 60 * 60 * 1000;

function boardsWatchedCount(): number | null {
  return Array.isArray(endpoints) ? endpoints.length : null;
}

async function readPublicStats(): Promise<PublicStats> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [companies, open, recent] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    // No hidden_at filter (fixed 2026-09-03, v7/feed lane): `roles.hidden_at`
    // is the OWNER's legacy per-user hide, superseded by `user_roles` (D3/D4).
    // Counting it here understated the public "open roles" tile by every role
    // Karthik had ever hidden. Public = open, full stop.
    supabase.from("roles").select("id", { count: "exact", head: true }).eq("lifecycle", "open"),
    supabase.from("roles").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  // Throw, don't swallow: unstable_cache below only caches a successful
  // resolve, so a caught-and-returned EMPTY_STATS here would get cached as if
  // the counts were genuinely zero. See lib/cache-guard.ts.
  if (companies.error || open.error || recent.error) {
    throw companies.error ?? open.error ?? recent.error;
  }
  return {
    boardsWatched: boardsWatchedCount(),
    companies: companies.count ?? null,
    openRoles: open.count ?? null,
    addedLast24h: recent.count ?? null,
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
