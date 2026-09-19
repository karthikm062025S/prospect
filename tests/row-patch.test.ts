import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergePatch,
  correctionPatch,
  uncorrectionPatch,
  rollbackPatch,
} from "../lib/row-patch.ts";

// Task 3 L5 fold (audit B1/B2) + fold 2 (shared labels). Pure lib, real
// behavior tests.

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    season: "fall_2027",
    family: "swe",
    families: ["swe"],
    visa_class: null,
    eligibility_note: null,
    corrected: [] as string[],
    shared: null,
    ...overrides,
  };
}

test("mergePatch keeps unrelated keys (season + saved_at survive a family patch)", () => {
  const prev = { id: "r1", season: "fall_2027", saved_at: "2026-09-01T00:00:00Z" };
  const next = { id: "r1", family: "swe", families: ["swe"], corrected: ["family"] };
  const merged = mergePatch(prev, next);
  assert.deepEqual(merged, {
    id: "r1",
    season: "fall_2027",
    saved_at: "2026-09-01T00:00:00Z",
    family: "swe",
    families: ["swe"],
    corrected: ["family"],
  });
});

test("mergePatch: next's keys win over prev's", () => {
  const prev = { id: "r1", season: "fall_2027" };
  const next = { id: "r1", season: "spring_2028" };
  assert.deepEqual(mergePatch(prev, next), { id: "r1", season: "spring_2028" });
});

test("mergePatch with no prev returns next unchanged", () => {
  const next = { id: "r1", season: "fall_2027" };
  assert.equal(mergePatch(undefined, next), next);
});

test("correctionPatch: season", () => {
  const patch = correctionPatch("season", "spring_2028", baseRow());
  assert.deepEqual(patch, {
    season: "spring_2028",
    corrected: ["season"],
    shared: { season: "fall_2027", family: "swe", families: ["swe"], visa_class: null, eligibility_note: null },
  });
});

test("correctionPatch: family sets both family and families", () => {
  const patch = correctionPatch("family", "ai_ml", baseRow({ corrected: ["season"] }));
  assert.deepEqual(patch, {
    family: "ai_ml",
    families: ["ai_ml"],
    corrected: ["season", "family"],
    shared: { season: "fall_2027", family: "swe", families: ["swe"], visa_class: null, eligibility_note: null },
  });
});

test("correctionPatch: visa_class nulls eligibility_note", () => {
  const patch = correctionPatch("visa_class", "clean", baseRow({ eligibility_note: "Posting says: x." }));
  assert.deepEqual(patch, {
    visa_class: "clean",
    eligibility_note: null,
    corrected: ["visa_class"],
    shared: { season: "fall_2027", family: "swe", families: ["swe"], visa_class: null, eligibility_note: "Posting says: x." },
  });
});

test("correctionPatch: correcting the same field twice does not duplicate it in corrected", () => {
  const patch = correctionPatch("season", "coop", baseRow({ corrected: ["season"] }));
  assert.deepEqual(patch.corrected, ["season"]);
});

// --- fold 2: shared labels -----------------------------------------------

test("correctionPatch on a row with shared: null snapshots the five current fields", () => {
  const row = baseRow({
    season: "fall_2027",
    family: "swe",
    families: ["swe"],
    visa_class: "question",
    eligibility_note: "Posting says: hedge.",
  });
  const patch = correctionPatch("season", "spring_2028", row);
  assert.deepEqual(patch.shared, {
    season: "fall_2027",
    family: "swe",
    families: ["swe"],
    visa_class: "question",
    eligibility_note: "Posting says: hedge.",
  });
});

test("correctionPatch reuses an existing shared snapshot instead of re-deriving it from an already-corrected row", () => {
  const existingShared = { season: "fall_2027", family: "swe", families: ["swe"], visa_class: null, eligibility_note: null };
  // row.season is already "spring_2028" (a prior correction) — re-snapshotting
  // from it would wrongly treat the corrected value as "shared".
  const row = baseRow({ season: "spring_2028", corrected: ["season"], shared: existingShared });
  const patch = correctionPatch("family", "ai_ml", row);
  assert.equal(patch.shared, existingShared, "must reuse the same shared object, never re-derive from the corrected row");
});

test("uncorrectionPatch restores the shared value for one field and drops only that field from corrected", () => {
  const sharedRow = {
    season: "fall_2027",
    family: "swe",
    families: ["swe"],
    visa_class: "no_sponsors",
    eligibility_note: 'Posting says: "no sponsorship". You can still apply.',
    corrected: ["season", "family"],
  };
  const patch = uncorrectionPatch("season", sharedRow);
  assert.deepEqual(patch, { season: "fall_2027", corrected: ["family"] });
});

test("uncorrectionPatch: family restores both family and families from the shared row", () => {
  const sharedRow = {
    season: "fall_2027",
    family: "data",
    families: ["data", "ai_ml"],
    visa_class: null,
    eligibility_note: null,
    corrected: ["family"],
  };
  const patch = uncorrectionPatch("family", sharedRow);
  assert.deepEqual(patch, { family: "data", families: ["data", "ai_ml"], corrected: [] });
});

test("uncorrectionPatch: visa_class restores the shared visa_class and note together", () => {
  const sharedRow = {
    season: "fall_2027",
    family: "swe",
    families: ["swe"],
    visa_class: "question",
    eligibility_note: "Posting says: hedge. You can still apply.",
    corrected: ["visa_class"],
  };
  const patch = uncorrectionPatch("visa_class", sharedRow);
  assert.deepEqual(patch, {
    visa_class: "question",
    eligibility_note: "Posting says: hedge. You can still apply.",
    corrected: [],
  });
});

test("rollbackPatch restores only the one field's pre-call values, and corrected exactly as it was", () => {
  const before = {
    season: "fall_2027",
    family: "swe",
    families: ["swe"],
    visa_class: "clean",
    eligibility_note: null,
    corrected: ["visa_class"],
  };
  const patch = rollbackPatch("season", before);
  assert.deepEqual(patch, { season: "fall_2027", corrected: ["visa_class"] });
});

test("rollbackPatch never touches a different field's values", () => {
  const before = {
    season: "fall_2027",
    family: "swe",
    families: ["swe"],
    visa_class: "clean",
    eligibility_note: null,
    corrected: ["visa_class"],
  };
  const patch = rollbackPatch("visa_class", before);
  assert.deepEqual(Object.keys(patch).sort(), ["corrected", "eligibility_note", "visa_class"]);
  assert.equal("season" in patch, false);
  assert.equal("family" in patch, false);
});

// Scenario test (per the fold's B1/B2 fix): patch A (season), then patch B
// (family), merged sequentially into the same overlay entry — mirrors what
// components/home-list.tsx's mergeRow does. Then A fails and rolls back:
// B's family correction must survive, season must revert to its pre-A value.
//
// rollbackPatch itself is a pure "replace this field + this exact corrected
// array" function — it has no way to know what changed to `corrected` AFTER
// its caller's `before` snapshot was taken. The caller (runCorrection in
// components/home-list.tsx) is what keeps this scenario correct: it re-reads
// the LIVE `corrected` list right before calling rollbackPatch (off a ref,
// never off the stale `before` snapshot — see the fold's comment in
// home-list.tsx) and filters out only the field it owns. This test proves
// BOTH halves: rollbackPatch does exactly what it's given (first assertion),
// and the caller-side "filter the live list" step produces the right result
// end to end (second assertion) — exactly what runCorrection does.
test("scenario: season then family merged, then rolling back season leaves family corrected", () => {
  const sharedRow = baseRow({ season: "fall_2027", family: "swe", families: ["swe"] });

  // A: correct season (before-snapshot = the shared row, since nothing else corrected yet).
  const beforeA = { season: sharedRow.season, family: sharedRow.family, families: sharedRow.families, visa_class: sharedRow.visa_class, eligibility_note: sharedRow.eligibility_note, corrected: sharedRow.corrected };
  const patchA = correctionPatch("season", "spring_2028", sharedRow);
  let overlay = mergePatch(undefined, { id: "r1", ...patchA });
  assert.equal(overlay.season, "spring_2028");
  assert.deepEqual(overlay.corrected, ["season"]);

  // B: correct family (optimistic row now reflects A's patch — read the row
  // as it stands AFTER A, exactly like onCorrectRow reads rowById at call time).
  const rowAfterA = { ...sharedRow, ...overlay };
  const patchB = correctionPatch("family", "ai_ml", rowAfterA);
  overlay = mergePatch(overlay, { id: "r1", ...patchB });
  assert.equal(overlay.season, "spring_2028");
  assert.equal(overlay.family, "ai_ml");
  assert.deepEqual(overlay.families, ["ai_ml"]);
  assert.deepEqual(overlay.corrected, ["season", "family"]);
  const liveRowAfterB = { ...sharedRow, ...overlay };

  // rollbackPatch, given A's stale `before` snapshot verbatim, replays a
  // stale `corrected` array and would silently un-tag family — proving why
  // the caller must never pass `before` through unmodified.
  const staleRollback = rollbackPatch("season", beforeA);
  assert.deepEqual(staleRollback, { season: "fall_2027", corrected: [] });

  // What runCorrection actually does: re-read the LIVE corrected list (here,
  // `liveRowAfterB.corrected`, standing in for rowByIdRef.current.get(id)
  // .corrected at rollback time) and filter out only the field this call owns
  // (season), before calling rollbackPatch.
  const liveCorrected = liveRowAfterB.corrected.filter((f: string) => f !== "season");
  overlay = mergePatch(overlay, {
    id: "r1",
    ...rollbackPatch("season", { ...beforeA, corrected: liveCorrected }),
  });
  assert.equal(overlay.season, "fall_2027"); // reverted to its pre-A value
  assert.equal(overlay.family, "ai_ml"); // B's correction survives, untouched
  assert.deepEqual(overlay.families, ["ai_ml"]);
  assert.deepEqual(overlay.corrected, ["family"]); // season dropped, family's tag survives
});

// Fold 2 scenario, exactly as specified: correct season, correct family, then
// uncorrect season — season must equal the ORIGINAL shared value immediately
// (no stale prior server read involved), family must still read corrected,
// and `shared` itself must still be intact for any further correction.
test("scenario: correct season, correct family, uncorrect season restores the original shared value at once", () => {
  let row = baseRow({ season: "fall_2027", family: "swe", families: ["swe"] });
  const originalShared = { season: "fall_2027", family: "swe", families: ["swe"], visa_class: null, eligibility_note: null };

  // Correct season: row.shared is null, so correctionPatch snapshots it now.
  let patch = correctionPatch("season", "spring_2028", row);
  let overlay = mergePatch(undefined, { id: "r1", ...patch });
  row = { ...row, ...overlay };
  assert.deepEqual(row.shared, originalShared);
  assert.equal(row.season, "spring_2028");

  // Correct family: row.shared is already set — reused, not re-derived from
  // the now-corrected season.
  patch = correctionPatch("family", "ai_ml", row);
  overlay = mergePatch(overlay, { id: "r1", ...patch });
  row = { ...row, ...overlay };
  assert.deepEqual(row.shared, originalShared);
  assert.equal(row.family, "ai_ml");
  assert.deepEqual(row.corrected, ["season", "family"]);

  // Uncorrect season: reads straight off row.shared — never a stale prior
  // server read (the limitation this fold closes).
  patch = uncorrectionPatch("season", { ...(row.shared as typeof originalShared), corrected: row.corrected });
  overlay = mergePatch(overlay, { id: "r1", ...patch });
  row = { ...row, ...overlay };

  assert.equal(row.season, (row.shared as typeof originalShared).season); // "season equals the original shared"
  assert.equal(row.season, "fall_2027");
  assert.deepEqual(row.corrected, ["family"]); // family still corrected
  assert.equal(row.family, "ai_ml");
  assert.deepEqual(row.shared, originalShared); // shared still intact
});
