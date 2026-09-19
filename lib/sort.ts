// Pure sort/group/search logic for the Home list (RB-002/003/005/006) plus the
// v5 "added" relative-day label (D28). No I/O, no config — the caller owns
// fetching and localStorage persistence.

// The shape every helper here actually reads. Generic over T so the Home page
// can pass a row type that deliberately OMITS jd_snapshot (payload rule A15)
// and still get its own row type back.
export type SortableRole = {
  id: string;
  company_id: string;
  company_name: string;
  title: string;
  created_at: string;
  deadline: string | null;
};

// D23: the "fit" sort is deleted with lib/fit.ts. D8: "deadline" is deleted
// (1/1295 rows had one; the option did nothing) in favor of "title".
export type HomeSort = "recent" | "company" | "title";
export const HOME_SORTS: readonly HomeSort[] = ["recent", "company", "title"];

// RB-003 search: case-insensitive substring over company name OR title.
export function matchesSearch(row: { company_name: string; title: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return row.company_name.toLowerCase().includes(q) || row.title.toLowerCase().includes(q);
}

// RB-006 / Task 3 T3/T3a (done-gate P1-2): one row per identity, keep the
// newest created_at as the visible row, preserve input order of survivors.
// The BASE group is the pre-T3 (company_id, trimmed lowercase title) key, so a
// keyless Gmail-alert copy still collapses onto its scanner twin. Rows that
// carry an ATS-id canonical_key (any form but the `co:` fallback) additionally
// UNION their base groups within the same company (T3a: tenant-scoped ids, so
// the company prefix is mandatory), which is how a title drift on the same
// posting still reads as one row.
type GroupRow = { company_id: string; title: string; canonical_key?: string | null };
function baseKey(row: GroupRow): string {
  return row.company_id + " " + row.title.trim().toLowerCase();
}
function atsKey(row: GroupRow): string | null {
  return row.canonical_key != null && !row.canonical_key.startsWith("co:") ? `${row.company_id}|${row.canonical_key}` : null;
}
function groupKeys<T extends GroupRow>(rows: T[]): Map<T, string> {
  const baseByAts = new Map<string, string>();
  for (const row of rows) {
    const ats = atsKey(row);
    if (ats && !baseByAts.has(ats)) baseByAts.set(ats, baseKey(row));
  }
  const keys = new Map<T, string>();
  for (const row of rows) {
    const ats = atsKey(row);
    keys.set(row, (ats && baseByAts.get(ats)) || baseKey(row));
  }
  return keys;
}

export function collapseDuplicates<
  T extends {
    company_id: string;
    title: string;
    created_at: string;
    canonical_key?: string | null;
    lifecycle?: string;
    application_id?: string | null;
    apply_clicked_at?: string | null;
  },
>(rows: T[]): T[] {
  const byKey = new Map<string, T[]>();
  const keys = groupKeys(rows);
  for (const row of rows) {
    const key = keys.get(row) as string;
    const group = byKey.get(key);
    if (group) group.push(row);
    else byKey.set(key, [row]);
  }

  // T3a: the winner (visible row) is still newest-first — a group's applied
  // signal only OVERLAYS the winner's own applied fields when a different,
  // collapsed-away member is the one that carries it. Which member is shown
  // never changes.
  const isApplied = (row: T) =>
    row.lifecycle === "applied" || row.application_id != null || row.apply_clicked_at != null;
  const mergedByWinner = new Map<T, T>();
  for (const group of byKey.values()) {
    let winner = group[0];
    for (const row of group) if (row.created_at > winner.created_at) winner = row;
    const appliedMember = group.find(isApplied);
    const merged =
      appliedMember && appliedMember !== winner && !isApplied(winner)
        ? {
            ...winner,
            lifecycle: appliedMember.lifecycle ?? winner.lifecycle,
            application_id: appliedMember.application_id ?? winner.application_id,
            apply_clicked_at: appliedMember.apply_clicked_at ?? winner.apply_clicked_at,
          }
        : winner;
    mergedByWinner.set(winner, merged);
  }

  return rows.filter((row) => mergedByWinner.has(row)).map((row) => mergedByWinner.get(row) as T);
}

// recent = created_at desc; company = name asc (tie -> recent);
// title = title asc, case-insensitive (tie -> recent). Never mutates the input.
export function sortRoles<T extends SortableRole>(rows: T[], sort: HomeSort): T[] {
  const byRecent = (a: T, b: T) => b.created_at.localeCompare(a.created_at);

  if (sort === "company") {
    return [...rows].sort((a, b) => a.company_name.localeCompare(b.company_name) || byRecent(a, b));
  }
  if (sort === "title") {
    return [...rows].sort(
      (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || byRecent(a, b),
    );
  }
  return [...rows].sort(byRecent);
}

export type HomeGroup<T extends SortableRole = SortableRole> = {
  company_id: string;
  company_name: string;
  roles: T[];
};

// RB-005: one group per company, in first-appearance order of the sorted
// input (so under "recent" groups order by their newest role).
export function groupByCompany<T extends SortableRole>(sorted: T[]): HomeGroup<T>[] {
  const groups: HomeGroup<T>[] = [];
  const byId = new Map<string, HomeGroup<T>>();
  for (const role of sorted) {
    let group = byId.get(role.company_id);
    if (!group) {
      group = { company_id: role.company_id, company_name: role.company_name, roles: [] };
      byId.set(role.company_id, group);
      groups.push(group);
    }
    group.roles.push(role);
  }
  return groups;
}

export function buildHomeList<T extends SortableRole>(
  rows: T[],
  opts: { sort: HomeSort; query: string },
): HomeGroup<T>[] {
  const filtered = rows.filter((row) => matchesSearch(row, opts.query));
  const collapsed = collapseDuplicates(filtered);
  const sorted = sortRoles(collapsed, opts.sort);
  return groupByCompany(sorted);
}

// --- A15 payload diet ------------------------------------------------------
// Measured on the real list (663 roles across 181 companies): the four
// per-company columns cost 67,394 JSON chars duplicated across the roles and
// 14,032 as one map keyed by company_id. So the server sends each company ONCE
// and this rebuilds the row every component downstream already reads — client
// memory is free, the HTML payload is not. `href` is NOT rebuilt here: the
// server still sanitizes the posting URL through lib/types.ts safeHttpUrl and
// ships that one field, so the trust boundary stays server-side.
export type HomeCompany = { name: string; tier: string | null; url: string | null; visa_note: string | null };

export function hydrateHomeRows<T extends { company_id: string }>(
  rows: T[],
  companies: Record<string, HomeCompany>,
): (T & {
  company_name: string;
  company_tier: string | null;
  company_url: string | null;
  company_visa_note: string | null;
})[] {
  return rows.map((row) => {
    const company = companies[row.company_id];
    return {
      ...row,
      // Same fallbacks the server-side join used: a role whose company row is
      // missing shows its company_id and carries no tier/url/visa note.
      company_name: company?.name ?? row.company_id,
      company_tier: company?.tier ?? null,
      company_url: company?.url ?? null,
      company_visa_note: company?.visa_note ?? null,
    };
  });
}

// A15 DOM cap: the list SSR'd every group it had (181 company groups / 663
// roles ≈ 851 KB of markup at ~4.8 KB a rendered row). Only the first
// HOME_GROUP_CAP groups render; the rest arrive on one "show more" click.
// This is a RENDER cap, never a data cap — every row stays in the client
// array, so the chip counts, the search, the sort and the dedup are computed
// over the whole list exactly as before.
export const HOME_GROUP_CAP = 60;

export function capHomeGroups<T extends SortableRole & { apply_clicked_at: string | null }>(
  groups: HomeGroup<T>[],
  showAll: boolean,
): HomeGroup<T>[] {
  if (showAll || groups.length <= HOME_GROUP_CAP) return groups;
  const head = groups.slice(0, HOME_GROUP_CAP);
  // RB-013: a persisted "Applied?" confirmation must never be hidden behind an
  // expander — the same rule the per-company expander already honors.
  // These append AFTER the head, i.e. out of sort order, by design: being seen
  // beats being in position for a confirmation the user already armed.
  const armed = groups.slice(HOME_GROUP_CAP).filter((g) => g.roles.some((r) => r.apply_clicked_at !== null));
  return armed.length === 0 ? head : head.concat(armed);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ONE fixed zone for every day boundary in the app (the owner applies from ET).
// The runtime's own local zone can NOT be used: the server renders in UTC and
// the browser re-renders in ET, so a role added at 21:30 ET reads "today" on
// the client and "yesterday" on the server — a hydration text mismatch every
// evening. lib/mcp-helpers.ts nyTodayStartIso made this same call.
// ponytail: the ~6 lines below are duplicated in lib/velocity.ts rather than
// imported — an extensionless lib↔lib VALUE import breaks
// `node --experimental-strip-types --test` (see lib/role-jd.ts's note).
const NY_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The instant's America/New_York calendar day, as a day number (days since
// the epoch). Subtracting two of these gives whole calendar days apart.
function nyDayNumber(ms: number): number {
  const [y, m, d] = NY_DAY.format(new Date(ms)).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

// D28 "added" label: how long ago Scout FOUND the role, in America/New_York
// calendar days, so the owner can see when each role appeared. Calendar-day
// boundaries, not 24h buckets — a role
// added at 23:50 yesterday reads "yesterday" at 00:10 today, not "today".
// A future timestamp (clock skew) degrades to "today", never a negative count.
export function relativeDay(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Not recorded";
  const days = nyDayNumber(nowMs) - nyDayNumber(then);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
