import type { RoleLevel, UpsertRoleInput } from "./upsert-role";

// Mirrors ROLE_LEVELS in lib/upsert-role.ts (type-only import above: a runtime
// value import between lib/*.ts files does not resolve under `node --test`).
const LEVELS = ["internship", "coop", "new_grad", "full_time", "research"] as const satisfies readonly RoleLevel[];

export type WatcherPayloadResult =
  | { ok: true; roles: UpsertRoleInput[] }
  | { ok: false; error: "payload must include at least one valid role" };

// 2026-09-19 addendum (drop latency): an optional ISO-8601 `source_posted_at`
// per role. A value that is present but is not strict ISO-8601 (V8's Date.parse
// also accepts "1" and "12/31/2030"), does not parse, or lies more than an hour
// in the future is dropped from that entry (the role still ingests; the latency
// column just stays null for it) — never stored, never guessed.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const FUTURE_SLACK_MS = 60 * 60 * 1000;
export function isSourcePostedAt(value: unknown, nowMs: number = Date.now()): value is string {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms <= nowMs + FUTURE_SLACK_MS;
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

// 2026-09-19 addendum 2: an optional `level` per role (LEVELS). A value outside
// the enum is dropped from that entry (null), never stored, never guessed.
function normalizeRole(role: UpsertRoleInput): UpsertRoleInput {
  const raw = role as Record<string, unknown>;
  let out = role;
  if (raw.source_posted_at !== undefined) {
    out = { ...out, source_posted_at: isSourcePostedAt(raw.source_posted_at) ? new Date(raw.source_posted_at).toISOString() : null };
  }
  if (raw.level !== undefined) {
    out = { ...out, level: (LEVELS as readonly unknown[]).includes(raw.level) ? (raw.level as RoleLevel) : null };
  }
  return out;
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
