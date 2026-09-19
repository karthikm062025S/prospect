import type { UpsertRoleInput } from "./upsert-role";

export type WatcherPayloadResult =
  | { ok: true; roles: UpsertRoleInput[] }
  | { ok: false; error: "payload must include at least one valid role" };

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

export function parseWatcherPayload(body: unknown): WatcherPayloadResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "payload must include at least one valid role" };
  }
  const input = body as { roles?: unknown };
  const roles = Array.isArray(input.roles) ? input.roles.filter(isValidRole) : [];
  return roles.length > 0
    ? { ok: true, roles }
    : { ok: false, error: "payload must include at least one valid role" };
}
