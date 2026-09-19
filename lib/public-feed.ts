import { unstable_cache } from "next/cache";
import { createServiceClient } from "./supabase/service";
import { deriveFamily, type Family } from "./family";
import { decodeEntities } from "./decode-entities";
import { SEASON_ORDER, deriveSeason, type Season } from "./season";
import { safeHttpUrl } from "./types";
import { groupDrops, relativeAdded, type CompanyDrop, type FeedRow } from "./public-feed-format";
import { guardedRead } from "./cache-guard";

// Server-only. Same standing as lib/public-stats.ts: the landing lives at
// app/welcome, OUTSIDE the (app) route group, so it is exempt from the V1
// structural rule that bans lib/supabase/service under app/(app)/**. These rows
// are the PUBLIC feed — the column set of the roles_public view, nothing
// per-user — and a signed-out visitor has no session for the anon client.

const LIMIT = 24;
const BASE = "id, title, location, created_at, link, companies(name)";
// Task 2 / D4 (lane L1, 2026-09-15): `families` (roles.families text[],
// nullable) added alongside `family` so the read-time rule below can prefer a
// stored multi-family classification over re-deriving from the title alone.
const WITH_FACETS = `${BASE}, season, family, families`;

type RawRow = {
  id: string;
  title: string;
  location: string | null;
  created_at: string;
  link: string | null;
  season?: string | null;
  family?: string | null;
  families?: Family[] | null;
  companies?: { name: string | null } | { name: string | null }[] | null;
};

function companyName(companies: RawRow["companies"]): string {
  const row = Array.isArray(companies) ? companies[0] : companies;
  return row?.name ?? "Unknown company";
}

const isSeason = (v: unknown): v is Season =>
  typeof v === "string" && (SEASON_ORDER as string[]).includes(v);

async function readPublicFeed(season?: Season): Promise<FeedRow[]> {
  const supabase = createServiceClient();
  const select = (columns: string) => {
    const query = supabase
      .from("roles")
      .select(columns)
      .eq("lifecycle", "open")
      // No hidden_at filter (fixed 2026-09-03, v7/feed lane): `roles.hidden_at`
      // is the OWNER's legacy per-user hide, superseded by `user_roles`
      // (D3/D4 — "one user must not starve the shared feed"). Filtering on it
      // made every role Karthik had hidden invisible to every visitor.
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    // v7 S4 LANDING-FLOW: with a season, this is "the latest 24 of THAT term",
    // cached under its own key. Without one it is the landing's default list,
    // byte-identical to what it was before.
    return (season ? query.eq("season", season) : query) as unknown as Promise<{
      data: RawRow[] | null;
      error: unknown;
    }>;
  };

  const { data, error } = await select(WITH_FACETS);
  // Throw, don't swallow: unstable_cache below only caches a successful
  // resolve, so a caught-and-returned [] here would get cached as if the feed
  // were genuinely empty. See lib/cache-guard.ts.
  if (error) throw error;

  const now = Date.now();
  return (data ?? []).map((row) => ({
    id: row.id,
    company: companyName(row.companies),
    title: decodeEntities(row.title),
    // Same rule as app/(app)/page.tsx so the landing and Home never label the
    // same posting differently: the stored column is a CACHE of these two pure
    // functions written at ingest, so trust a stored season only when it is
    // MORE specific than the title (it can have been derived from posting
    // text). family prefers the first entry of a stored multi-family
    // classification (Task 2 / D4) and falls back to deriving from the title
    // when the column is null (a classifier widening must not need a backfill
    // to reach already-stored rows).
    season: isSeason(row.season) && row.season !== "unspecified" ? row.season : deriveSeason(row.title),
    family: row.families?.[0] ?? deriveFamily(row.title),
    location: row.location,
    // Sanitized server-side so the trust boundary never moves to the client
    // (the same call app/(app)/page.tsx makes before shipping a posting URL).
    href: safeHttpUrl(row.link) ?? null,
    added: relativeAdded(row.created_at, now),
  }));
}

const cachedPublicFeed = unstable_cache(readPublicFeed, ["public-feed"], {
  revalidate: 600,
  tags: ["public-feed"],
});

/**
 * Cached for 10 minutes. Tag: public-feed. The landing must never 500 (or
 * serve a cached failure) because the DB blinked — the band renders its
 * empty state instead, computed fresh on every failed call.
 */
export const getPublicFeed = guardedRead(cachedPublicFeed, [], "public-feed");

// ---------------------------------------------------------------------------
// v7 S4 LANDING-FLOW: the season pills.
//
// The pills used to be a facet of the 24 rows above, so on live data they read
// "All 24 / Term not stated 24" while 405 Summer 2027 postings sat in the open
// set unreachable. Counts now come from the WHOLE open set and each term has
// its own cached list.

/**
 * Open-role count per season, over every open role. Six HEAD count queries in
 * ONE cached read: PostgREST has no group-by, and `count=exact` with
 * `head: true` transfers no rows at all, which is cheaper than paging ~1,300
 * `season` values through the 1,000-row cap to tally them here.
 */
async function readSeasonCounts(): Promise<Partial<Record<Season, number>>> {
  const supabase = createServiceClient();
  const results = await Promise.all(
    SEASON_ORDER.map((season) =>
      supabase
        .from("roles")
        .select("id", { count: "exact", head: true })
        .eq("lifecycle", "open")
        .eq("season", season),
    ),
  );
  // Throw, don't swallow — same contract as readPublicFeed above.
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  const counts: Partial<Record<Season, number>> = {};
  SEASON_ORDER.forEach((season, index) => {
    const count = results[index].count ?? 0;
    if (count > 0) counts[season] = count;
  });
  return counts;
}

const cachedSeasonCounts = unstable_cache(readSeasonCounts, ["public-season-counts"], {
  revalidate: 600,
  tags: ["public-feed"],
});

/** Cached for 10 minutes, same window as the feed so a pill's count and its
 *  rows are never read from two different snapshots. Tag: public-feed. */
export const getPublicSeasonCounts = guardedRead(cachedSeasonCounts, {}, "public-season-counts");

// unstable_cache keys on the callback's ARGUMENTS as well as the key parts, so
// one wrapper gives one cache entry per season.
const cachedSeasonFeed = unstable_cache(
  (season: Season) => readPublicFeed(season),
  ["public-feed-season"],
  { revalidate: 600, tags: ["public-feed"] },
);

export type SeasonSets = {
  /** Only seasons with at least one open role. */
  counts: Partial<Record<Season, number>>;
  /** The latest LIMIT rows of each of those seasons. */
  rows: Partial<Record<Season, FeedRow[]>>;
};

/**
 * Everything the landing's season pills need: the real counts, and the list a
 * visitor gets when they click one. Still no account, still no client fetch —
 * the lists ship with the page, so selecting a term is instant (D19.1: "no
 * fetch, no loading state, nothing to spin").
 */
export async function getPublicSeasonSets(): Promise<SeasonSets> {
  const counts = await getPublicSeasonCounts();
  const present = SEASON_ORDER.filter((season) => (counts[season] ?? 0) > 0);
  const lists = await Promise.all(
    present.map((season) =>
      guardedRead(() => cachedSeasonFeed(season), [] as FeedRow[], `public-feed:${season}`)(),
    ),
  );
  return {
    counts,
    rows: Object.fromEntries(present.map((season, index) => [season, lists[index]])),
  };
}

// ---------------------------------------------------------------------------
// v8 D12: the "Just dropped" strip.
//
// ONE query, grouped in JS. PostgREST has no group-by, and a week of postings
// is a few hundred rows of three narrow columns — cheaper than six HEAD counts
// against a company list we do not know in advance.

const DROP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** A week of ingest has run ~200-400 rows; 600 is headroom, not a page size. */
const DROP_SCAN_LIMIT = 600;

async function readCompanyDrops(): Promise<CompanyDrop[]> {
  const supabase = createServiceClient();
  const now = Date.now();
  const since = new Date(now - DROP_WINDOW_MS).toISOString();

  const { data, error } = (await supabase
    .from("roles")
    .select("created_at, title, companies(name)")
    .eq("lifecycle", "open")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(DROP_SCAN_LIMIT)) as unknown as { data: RawRow[] | null; error: unknown };

  // Throw, don't swallow — same contract as readPublicFeed above.
  if (error) throw error;

  return groupDrops(
    (data ?? []).map((row) => ({
      company: companyName(row.companies),
      title: decodeEntities(row.title),
      createdAt: row.created_at,
    })),
    now,
  );
}

const cachedCompanyDrops = unstable_cache(readCompanyDrops, ["public-company-drops"], {
  revalidate: 600,
  tags: ["public-feed"],
});

/** Cached for 10 minutes, same window and tag as the feed so the strip and the
 *  list below it are never read from two different snapshots. */
export const getPublicCompanyDrops = guardedRead(cachedCompanyDrops, [], "public-company-drops");
