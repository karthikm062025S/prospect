import { unstable_cache } from "next/cache";
import { query } from "./db";
import { deriveFamily, type Family } from "./family";
import { decodeEntities } from "./decode-entities";
import { SEASON_ORDER, deriveSeason, type Season } from "./season";
import { safeHttpUrl } from "./types";
import {
  groupDrops,
  relativeAdded,
  withFreshAdded,
  type CompanyDrop,
  type FeedRow,
  type FeedRowRaw,
} from "./public-feed-format";
import { guardedRead } from "./cache-guard";

// Server-only. Same standing as lib/public-stats.ts: the landing lives at
// app/welcome, OUTSIDE the (app) route group. These rows are the PUBLIC feed —
// the column set of the roles_public view plus the company name, nothing
// per-user — read straight from the shared tables for a signed-out visitor.

const LIMIT = 24;

type RawRow = {
  id: string;
  title: string;
  location: string | null;
  created_at: string;
  link: string | null;
  season?: string | null;
  family?: string | null;
  // Task 2 / D4 (lane L1, 2026-09-15): `families` (roles.families text[],
  // nullable) added alongside `family` so the read-time rule below can prefer a
  // stored multi-family classification over re-deriving from the title alone.
  families?: Family[] | null;
  company_name: string | null;
};

const isSeason = (v: unknown): v is Season =>
  typeof v === "string" && (SEASON_ORDER as string[]).includes(v);

async function readPublicFeed(season?: Season): Promise<FeedRowRaw[]> {
  // No hidden_at filter (fixed 2026-09-03, v7/feed lane): `roles.hidden_at`
  // is the OWNER's legacy per-user hide, superseded by `user_roles`
  // (D3/D4 — "one user must not starve the shared feed"). Filtering on it
  // made every role Karthik had hidden invisible to every visitor.
  // v7 S4 LANDING-FLOW: with a season, this is "the latest 24 of THAT term",
  // cached under its own key. Without one it is the landing's default list.
  // A failed read throws: unstable_cache below only caches a successful
  // resolve, so a caught-and-returned [] here would get cached as if the feed
  // were genuinely empty. See lib/cache-guard.ts.
  const data = await query<RawRow>(
    `select r.id, r.title, r.location, r.created_at, r.link, r.season, r.family, r.families, c.name as company_name
       from roles r left join companies c on c.id = r.company_id
      where r.lifecycle = 'open' and ($1::text is null or r.season = $1)
      order by r.created_at desc
      limit ${LIMIT}`,
    [season ?? null],
    "roles",
  );

  return data.map((row) => ({
    id: row.id,
    company: row.company_name ?? "Unknown company",
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
    createdAt: row.created_at,
  }));
}

const cachedPublicFeed = unstable_cache(readPublicFeed, ["public-feed"], {
  revalidate: 600,
  tags: ["public-feed"],
});

/**
 * Cached for 10 minutes. Tag: public-feed. The landing must never 500 (or
 * serve a cached failure) because the DB blinked — the band renders its
 * empty state instead, computed fresh on every failed call. `added` is
 * computed fresh on every call too, outside the cache (withFreshAdded).
 */
const guardedPublicFeed = guardedRead(cachedPublicFeed, [] as FeedRowRaw[], "public-feed");
export const getPublicFeed = async (): Promise<FeedRow[]> => withFreshAdded(await guardedPublicFeed());

// ---------------------------------------------------------------------------
// v7 S4 LANDING-FLOW: the season pills.
//
// The pills used to be a facet of the 24 rows above, so on live data they read
// "All 24 / Term not stated 24" while 405 Summer 2027 postings sat in the open
// set unreachable. Counts now come from the WHOLE open set and each term has
// its own cached list.

/** Open-role count per season, over every open role, in ONE grouped read. */
async function readSeasonCounts(): Promise<Partial<Record<Season, number>>> {
  const rows = await query<{ season: string; n: number }>(
    "select season, count(*)::int as n from roles where lifecycle = 'open' group by season",
    [],
    "roles",
  );
  const counts: Partial<Record<Season, number>> = {};
  for (const row of rows) {
    if (isSeason(row.season) && row.n > 0) counts[row.season] = row.n;
  }
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
      guardedRead(() => cachedSeasonFeed(season), [] as FeedRowRaw[], `public-feed:${season}`)(),
    ),
  );
  return {
    counts,
    rows: Object.fromEntries(present.map((season, index) => [season, withFreshAdded(lists[index])])),
  };
}

// ---------------------------------------------------------------------------
// v8 D12: the "Just dropped" strip.
//
// ONE query, grouped in JS (groupDrops owns the per-company cap and ordering).

const DROP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** A week of ingest has run ~200-400 rows; 600 is headroom, not a page size. */
const DROP_SCAN_LIMIT = 600;

async function readCompanyDrops(): Promise<CompanyDrop[]> {
  const now = Date.now();
  const since = new Date(now - DROP_WINDOW_MS).toISOString();

  // Throw, don't swallow — same contract as readPublicFeed above.
  const data = await query<{ created_at: string; title: string; company_name: string | null }>(
    `select r.created_at, r.title, c.name as company_name
       from roles r left join companies c on c.id = r.company_id
      where r.lifecycle = 'open' and r.created_at >= $1
      order by r.created_at desc
      limit ${DROP_SCAN_LIMIT}`,
    [since],
    "roles",
  );

  return groupDrops(
    data.map((row) => ({
      company: row.company_name ?? "Unknown company",
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
 *  list below it are never read from two different snapshots. `added` is
 *  recomputed here from the cached `newestAt`, so it is never frozen at
 *  cache-write time (same reason as withFreshAdded above). */
const guardedCompanyDrops = guardedRead(cachedCompanyDrops, [] as CompanyDrop[], "public-company-drops");
export const getPublicCompanyDrops = async (): Promise<CompanyDrop[]> => {
  const now = Date.now();
  const drops = await guardedCompanyDrops();
  return drops.map((drop) => ({ ...drop, added: relativeAdded(drop.newestAt, now) }));
};
