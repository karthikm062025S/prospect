// Task 3 L5 fold (audit B1/B2). Pure, ZERO imports — module rule: no
// extensionless value import between lib/*.ts files, and this module is
// small/stable enough to just re-declare its own field union rather than
// import Season/Family/CorrectionField from their real modules.
//
// The bug this fixes: components/home-list.tsx's old `patchRow` REPLACED a
// row's whole overlay entry (`new Map(o.patched).set(id, patch)`), and the
// correction control built a patch holding only the field it changed — so
// correcting Season then Role on one row dropped the Season patch (and any
// in-flight saved_at/hidden_at patch) before the next real reload (B1). The
// old rollback also restored a whole-row SNAPSHOT captured at call time, so
// an earlier failing request that resolved after a later correction on a
// DIFFERENT field clobbered that later correction (B2).
//
// mergePatch fixes B1 (field-scoped merge, next wins, nothing else in the
// row's existing overlay entry is lost). correctionPatch/uncorrectionPatch/
// rollbackPatch each build a FIELD-SCOPED patch fragment, so a rollback only
// ever touches the one field its own call changed — never a whole-row
// snapshot — which is what B2's fix (a generation guard in home-list.tsx)
// needs to be safe.

export type RowPatchLike = { id: string } & Record<string, unknown>;

export type CorrectionFieldLike = "season" | "family" | "visa_class";

/** Shallow merge: `next`'s keys win, every other key already on `prev` survives. */
export function mergePatch(prev: RowPatchLike | undefined, next: RowPatchLike): RowPatchLike {
  return prev ? { ...prev, ...next } : next;
}

function addCorrected(corrected: readonly string[], field: string): string[] {
  return corrected.includes(field) ? [...corrected] : [...corrected, field];
}

type FieldValues = {
  season: unknown;
  family: unknown;
  families: unknown;
  visa_class: unknown;
  eligibility_note: unknown;
};

type FieldSource = FieldValues & { corrected: readonly string[] };

function snapshot(row: FieldValues): FieldValues {
  return {
    season: row.season,
    family: row.family,
    families: Array.isArray(row.families) ? [...row.families] : row.families,
    visa_class: row.visa_class,
    eligibility_note: row.eligibility_note,
  };
}

/** The field-scoped patch fragment a correction applies optimistically.
 *  `row` is the CURRENT optimistic row (its own five values + `corrected` +
 *  `shared`). Fold 2: also carries `shared` forward — a fresh snapshot of
 *  `row`'s current five values the first time this row is ever corrected
 *  this session (`row.shared` is still null), else `row.shared` untouched,
 *  so a later "Shared label" always restores the TRUE original values, never
 *  an already-corrected one. */
export function correctionPatch(
  field: CorrectionFieldLike,
  value: string,
  row: FieldSource & { shared: FieldValues | null },
): Record<string, unknown> {
  const nextCorrected = addCorrected(row.corrected, field);
  const shared = row.shared ?? snapshot(row);
  const base =
    field === "season"
      ? { season: value }
      : field === "family"
        ? { family: value, families: [value] }
        : { visa_class: value, eligibility_note: null };
  return { ...base, corrected: nextCorrected, shared };
}

function fieldOnly(field: CorrectionFieldLike, source: FieldSource): Record<string, unknown> {
  if (field === "season") return { season: source.season };
  if (field === "family") return { family: source.family, families: source.families };
  return { visa_class: source.visa_class, eligibility_note: source.eligibility_note };
}

/** Restores the SHARED (server) value for one field only, and drops that
 *  field from `corrected` — the other fields in `corrected` are untouched. */
export function uncorrectionPatch(field: CorrectionFieldLike, sharedRow: FieldSource): Record<string, unknown> {
  return { ...fieldOnly(field, sharedRow), corrected: sharedRow.corrected.filter((f) => f !== field) };
}

/** Restores exactly what ONE failed call changed: the field's values as they
 *  were on the row immediately before that call, plus `corrected` exactly as
 *  it was before that call. Never a whole-row snapshot — a different field's
 *  correction that already landed is untouched. */
export function rollbackPatch(field: CorrectionFieldLike, before: FieldSource): Record<string, unknown> {
  return { ...fieldOnly(field, before), corrected: [...before.corrected] };
}
