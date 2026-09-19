import type { UpsertRoleInput } from "./upsert-role";

export type WatcherPayloadResult =
  | { ok: true; roles: UpsertRoleInput[] }
  | { ok: false; error: "payload must include at least one valid role" };

// 2026-09-19 addendum (drop latency): an optional ISO-8601 `source_posted_at`
// per role. A value that is present but does not parse as a date is dropped
// from that entry (the role still ingests; the latency column just stays null
// for it) — never stored, never guessed.
function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function isValidRole(value: unknown): value is UpsertRoleInput {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.company === "string" &&
    row.company.trim().length > 0 &&
    typeof row.title === "string" &&
    row.title.trim().length > 0
  );
}

function normalizeRole(role: UpsertRoleInput): UpsertRoleInput {
  const raw = (role as Record<string, unknown>).source_posted_at;
  if (raw === undefined) return role;
  return { ...role, source_posted_at: isIsoDate(raw) ? new Date(raw).toISOString() : null };
}

export function parseWatcherPayload(body: unknown): WatcherPayloadResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "payload must include at least one valid role" };
  }
  const input = body as { roles?: unknown };
  const roles = Array.isArray(input.roles) ? input.roles.filter(isValidRole).map(normalizeRole) : [];
  return roles.length > 0
    ? { ok: true, roles }
    : { ok: false, error: "payload must include at least one valid role" };
}
