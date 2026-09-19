import type { QueryFn } from "./db";
import type { Season } from "./season";
import type { Family } from "./family";
import type { VisaClass } from "./types";

// T5 (K1): a per-user correction never touches the shared `roles` row. This
// file owns validation (parseCorrection), the write (saveCorrection /
// removeCorrection against role_corrections), and the pure read-time
// overlay (overlayCorrections) that applies a caller's corrections to their
// own view only. Module rule: TYPE-only imports from lib/season.ts and
// lib/family.ts; the allowed-value lists below are inlined `as const`
// arrays, never the SEASON_ORDER/FAMILY_ORDER value exports (tests/
// corrections.test.ts proves the inlined lists stay in sync with those).

export const CORRECTION_FIELDS = ["season", "family", "visa_class"] as const;
export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

// Copied verbatim from lib/season.ts `Season` / lib/family.ts `Family`.
const SEASON_VALUES = [
  "summer_2027",
  "fall_2027",
  "spring_2028",
  "summer_2028",
  "coop",
  "unspecified",
] as const satisfies readonly Season[];

const FAMILY_VALUES = [
  "swe",
  "ai_ml",
  "data",
  "quant",
  "product",
  "security",
  "hardware",
  "design",
  "other",
] as const satisfies readonly Family[];

const VISA_CLASS_VALUES = ["clean", "question", "no_sponsors", "citizen_required"] as const satisfies readonly VisaClass[];

const ALLOWED_VALUES: Record<CorrectionField, readonly string[]> = {
  season: SEASON_VALUES,
  family: FAMILY_VALUES,
  visa_class: VISA_CLASS_VALUES,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Correction = { role_id: string; field: CorrectionField; value: string };

// Task 3 L5 fold 2: the row's five correctable-adjacent values AS THEY STOOD
// BEFORE this overlay ran — i.e. the true shared/server value, captured once
// per row on its first correction. Lets an "uncorrect" restore the real
// shared label immediately, instead of falling back to a stale prior server
// read (the limitation the original L5 handoff disclosed and this fold
// closes).
export type SharedLabels = {
  season: string;
  family: string;
  families: string[];
  visa_class: string | null;
  eligibility_note: string | null;
};

// FR-009: field and value validated against fixed allowed lists, uid never
// taken from the client. Returns null on anything that does not match — the
// caller never writes on a null.
export function parseCorrection(input: {
  roleId: unknown;
  field: unknown;
  value: unknown;
}): { roleId: string; field: CorrectionField; value: string } | null {
  const { roleId, field, value } = input;
  if (typeof roleId !== "string" || !UUID_RE.test(roleId)) return null;
  if (typeof field !== "string" || !(CORRECTION_FIELDS as readonly string[]).includes(field)) return null;
  const correctionField = field as CorrectionField;
  if (typeof value !== "string" || !ALLOWED_VALUES[correctionField].includes(value)) return null;
  return { roleId, field: correctionField, value };
}

// T5: one row per (uid, role_id, field), never a write to roles.
export async function saveCorrection(q: QueryFn, uid: string, c: Correction, nowIso: string): Promise<void> {
  await q(
    `insert into role_corrections (user_id, role_id, field, value, updated_at)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, role_id, field) do update set value = excluded.value, updated_at = excluded.updated_at`,
    [uid, c.role_id, c.field, c.value, nowIso],
    "role_corrections",
  );
}

export async function removeCorrection(q: QueryFn, uid: string, roleId: string, field: CorrectionField): Promise<void> {
  await q(
    "delete from role_corrections where user_id = $1 and role_id = $2 and field = $3",
    [uid, roleId, field],
    "role_corrections",
  );
}

// Pure. Applies the caller's own corrections onto their own row set, never
// touching the shared roles row and never mutating an input row — every
// returned row is a fresh object.
export function overlayCorrections<
  T extends {
    id: string;
    season: string;
    family: string;
    families: string[];
    visa_class: string | null;
    eligibility_note: string | null;
  },
>(rows: T[], corrections: Correction[]): (T & { corrected: CorrectionField[]; shared: SharedLabels | null })[] {
  const byRoleId = new Map<string, Correction[]>();
  for (const c of corrections) {
    const existing = byRoleId.get(c.role_id);
    if (existing) existing.push(c);
    else byRoleId.set(c.role_id, [c]);
  }

  return rows.map((row) => {
    const applicable = byRoleId.get(row.id) ?? [];
    const corrected: CorrectionField[] = [];
    // Fold 2: snapshotted BEFORE any patch below runs — the row's real
    // shared/server values, fresh objects/arrays so mutating `shared` can
    // never reach back into the input row (tests/corrections.test.ts).
    const shared: SharedLabels | null =
      applicable.length > 0
        ? {
            season: row.season,
            family: row.family,
            families: [...row.families],
            visa_class: row.visa_class,
            eligibility_note: row.eligibility_note,
          }
        : null;
    let patched: T = { ...row };
    for (const c of applicable) {
      corrected.push(c.field);
      if (c.field === "season") {
        patched = { ...patched, season: c.value as T["season"] };
      } else if (c.field === "family") {
        patched = { ...patched, family: c.value as T["family"], families: [c.value] as T["families"] };
      } else {
        patched = { ...patched, visa_class: c.value as T["visa_class"], eligibility_note: null };
      }
    }
    return { ...patched, corrected, shared };
  });
}
