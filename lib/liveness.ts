// Task 3 T2/V3: liveness label + repost text, derived at READ time
// from the row's last confirmation — never stored. Nothing here hides a row;
// the caller decides what to do with the label.
//
// Pure, zero local imports (per the module rule tests import this file
// directly): NY_DAY/nyDayNumber are duplicated from lib/sort.ts /
// lib/velocity.ts rather than imported — an extensionless lib<->lib VALUE
// import breaks `node --experimental-strip-types --test` (lib/role-jd.ts's
// note on the same gotcha).

const DAY_MS = 24 * 60 * 60 * 1000;

// ONE fixed zone for the day boundary, matching lib/sort.ts relativeDay and
// lib/velocity.ts velocity — the owner reads this from ET, and a UTC boundary
// would disagree with the server/client render every evening.
const NY_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function nyDayNumber(ms: number): number {
  const [y, m, d] = NY_DAY.format(new Date(ms)).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

// "seen once <Mon D>" date, e.g. "Sep 3" — en-US short month, America/New_York.
const SIGHTING_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});

// T2: only a source that actually re-scans a posting counts as re-confirming
// it (scanner, and every feed source, incl. feed-target: variants). Every
// other source (linkedin/indeed/handshake/direct/mcp/null) is a single Gmail
// alert or a one-off add — it can only ever have seen the posting once.
function isReconfirming(source: string | null): boolean {
  return source === "scanner" || (source !== null && (source.startsWith("feed:") || source.startsWith("feed-target:")));
}

export function liveness(
  row: {
    source: string | null;
    last_seen_at?: string | null;
    updated_at?: string | null;
    created_at: string;
    repost_count?: number | null;
  },
  nowMs: number,
): { label: string; repost: string | null } {
  const referenceIso = row.last_seen_at ?? row.updated_at ?? row.created_at;
  const referenceMs = new Date(referenceIso).getTime();
  const repost = row.repost_count && row.repost_count > 0 ? `reposted ${row.repost_count}x` : null;

  if (isReconfirming(row.source)) {
    // Clock skew (a reference instant after "now") degrades to "seen today",
    // never a negative count — same guard as lib/sort.ts relativeDay.
    const days = Math.max(0, nyDayNumber(nowMs) - nyDayNumber(referenceMs));
    const label = days === 0 ? "seen today" : days === 1 ? "last seen 1 day ago" : `last seen ${days} days ago`;
    return { label, repost };
  }

  return { label: `seen once ${SIGHTING_DATE.format(new Date(referenceMs))}`, repost };
}
