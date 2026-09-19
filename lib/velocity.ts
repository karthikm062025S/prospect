// RB-007: applied today/this week/this month vs the monthly target. Injectable
// clock. Every boundary here is an America/New_York calendar day — the owner
// applies from ET, and a UTC boundary made the server and the client disagree
// about "today" every evening (hydration mismatch).
//
// v8 D11: the target is no longer a fixed constant -- it is the caller's
// per-user `monthly_target` (lib/profile.ts), passed in and returned as-is.
// null means the user has not set one.

// ONE fixed zone for every day boundary in the app.
// ponytail: the ~6 lines below are duplicated from lib/sort.ts (same helper as
// lib/mcp-helpers.ts nyTodayStartIso) rather than imported — an extensionless
// lib↔lib VALUE import breaks `node --experimental-strip-types --test`
// (see lib/role-jd.ts's note on that gotcha).
const NY_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The instant's America/New_York calendar date as `YYYY-MM-DD` (en-CA formats
// exactly that way), directly comparable with a `date_applied` date string.
function nyDate(ms: number): string {
  return NY_DAY.format(new Date(ms));
}

export function velocity(
  apps: { date_applied: string | null }[],
  nowMs: number = Date.now(),
  target: number | null = null,
): { today: number; week: number; month: number; target: number | null } {
  const today = nyDate(nowMs);
  const weekAgo = nyDate(nowMs - 6 * 24 * 60 * 60 * 1000);
  const monthStart = `${today.slice(0, 7)}-01`;
  const dates = apps.map((a) => a.date_applied?.slice(0, 10) ?? null);
  return {
    today: dates.filter((d) => d === today).length,
    week: dates.filter((d) => d !== null && d >= weekAgo).length,
    month: dates.filter((d) => d !== null && d >= monthStart).length,
    target,
  };
}

// v5 counts strip: how many roles Scout found today alongside the signed-in
// user's application counts. EVERY role created since
// NY midnight counts — raw drops, no lifecycle/hidden/applied filter — because
// that is literally the question asked.
export function addedToday(roles: { created_at: string }[], nowMs: number = Date.now()): number {
  const today = nyDate(nowMs);
  return roles.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return !Number.isNaN(t) && nyDate(t) === today;
  }).length;
}
