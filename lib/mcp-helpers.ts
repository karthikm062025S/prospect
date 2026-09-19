// Pure helpers for app/api/[transport]/route.ts (v5 D27 MCP additions),
// co-located here with ZERO local imports (no @/lib/* / relative runtime
// imports) so `node --experimental-strip-types` can resolve them directly in
// tests — importing route.ts itself would drag in its @/lib/* aliases, which
// only the Next/tsc bundler (not plain node) knows how to resolve. See the
// my_projects mistake note on this exact node/tsc extension gotcha.

// "today" for roles_added_today is a calendar boundary in America/New York
// (the owner applies from ET), computed here rather than trusting the DB
// server's timezone. Uses the given instant's NY UTC offset directly, which
// is correct except in the exact minute of a DST changeover — an acceptable
// shortcut for a daily count.
export function nyTodayStartIso(now: Date = new Date()): string {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset",
  })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = offsetPart?.replace("GMT", "") || "-05:00";
  return new Date(`${dateStr}T00:00:00${offset}`).toISOString();
}

// Pure patch builder for set_role_flags. Returns null when neither flag was
// given — the tool handler turns that into the rejection.
export function buildRoleFlagsPatch(
  input: { saved?: boolean; hidden?: boolean },
  now: string = new Date().toISOString(),
): { saved_at?: string | null; hidden_at?: string | null } | null {
  if (input.saved === undefined && input.hidden === undefined) return null;
  const patch: { saved_at?: string | null; hidden_at?: string | null } = {};
  if (input.saved !== undefined) patch.saved_at = input.saved ? now : null;
  if (input.hidden !== undefined) patch.hidden_at = input.hidden ? now : null;
  return patch;
}
