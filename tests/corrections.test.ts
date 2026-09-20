import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CORRECTION_FIELDS,
  parseCorrection,
  saveCorrection,
  removeCorrection,
  overlayCorrections,
  type Correction,
} from "../lib/corrections.ts";
import { SEASON_ORDER, type Season } from "../lib/season.ts";
import { FAMILY_ORDER, type Family } from "../lib/family.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

const ROOT = resolve(import.meta.dirname, "..");
const VALID_ROLE_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ROLE_ID = "22222222-2222-2222-2222-222222222222";
const UID = uuid(1);
const OTHER_UID = uuid(2);
const COMPANY = uuid(10);
const NOW = "2026-09-16T12:00:00.000Z";

// The write path runs against the real schema (pglite): role_corrections has a
// real FK to roles, a real PK on (user_id, role_id, field) and the value CHECK.
let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());
beforeEach(async () => {
  await truncateAll(db.q);
  await insertRow(db.q, "companies", { id: COMPANY, name: "Acme" });
  await insertRow(db.q, "roles", { id: VALID_ROLE_ID, company_id: COMPANY, title: "Software Engineer Intern" });
  await insertRow(db.q, "roles", { id: OTHER_ROLE_ID, company_id: COMPANY, title: "Data Analyst Intern" });
});
const correctionRows = () =>
  db.q<{ user_id: string; role_id: string; field: string; value: string }>(
    "select user_id, role_id, field, value from role_corrections order by user_id, field",
  );

// --- parseCorrection ---------------------------------------------------

test("parseCorrection rejects an unknown field", () => {
  assert.equal(parseCorrection({ roleId: VALID_ROLE_ID, field: "priority", value: "high" }), null);
});

test("parseCorrection rejects a value outside the field's allowed list", () => {
  assert.equal(parseCorrection({ roleId: VALID_ROLE_ID, field: "season", value: "winter" }), null);
});

test("parseCorrection rejects a non-uuid roleId", () => {
  assert.equal(parseCorrection({ roleId: "not-a-uuid", field: "season", value: "fall_2027" }), null);
  assert.equal(parseCorrection({ roleId: "", field: "season", value: "fall_2027" }), null);
});

test("parseCorrection rejects non-string inputs", () => {
  assert.equal(parseCorrection({ roleId: 123, field: "season", value: "fall_2027" }), null);
  assert.equal(parseCorrection({ roleId: VALID_ROLE_ID, field: null, value: "fall_2027" }), null);
  assert.equal(parseCorrection({ roleId: VALID_ROLE_ID, field: "season", value: undefined }), null);
});

test("parseCorrection accepts each field with a valid value", () => {
  assert.deepEqual(parseCorrection({ roleId: VALID_ROLE_ID, field: "season", value: "fall_2027" }), {
    roleId: VALID_ROLE_ID,
    field: "season",
    value: "fall_2027",
  });
  assert.deepEqual(parseCorrection({ roleId: VALID_ROLE_ID, field: "family", value: "data_ai" }), {
    roleId: VALID_ROLE_ID,
    field: "family",
    value: "data_ai",
  });
  assert.deepEqual(parseCorrection({ roleId: VALID_ROLE_ID, field: "visa_class", value: "no_sponsors" }), {
    roleId: VALID_ROLE_ID,
    field: "visa_class",
    value: "no_sponsors",
  });
});

// The inlined allowed-value lists in lib/corrections.ts must stay in exact
// sync with lib/season.ts Season / lib/family.ts Family — this is the
// exhaustiveness proof the module rule pushed out of the source file (it may
// only import TYPES, not the SEASON_ORDER/FAMILY_ORDER value exports).
test("every Season and Family value is accepted by parseCorrection", () => {
  for (const season of SEASON_ORDER as Season[]) {
    assert.notEqual(parseCorrection({ roleId: VALID_ROLE_ID, field: "season", value: season }), null, season);
  }
  for (const family of FAMILY_ORDER as Family[]) {
    assert.notEqual(parseCorrection({ roleId: VALID_ROLE_ID, field: "family", value: family }), null, family);
  }
});

// --- saveCorrection / removeCorrection ---------------------------------

test("saveCorrection writes exactly one row carrying the given uid; upsert on repeat stays one row with the new value", async () => {
  const c: Correction = { role_id: VALID_ROLE_ID, field: "season", value: "fall_2027" };

  await saveCorrection(db.q, UID, c, NOW);
  let rows = await correctionRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, UID);
  assert.equal(rows[0].value, "fall_2027");

  await saveCorrection(db.q, UID, { ...c, value: "spring_2028" }, NOW);
  rows = await correctionRows();
  assert.equal(rows.length, 1, "upsert on repeat must not insert a second row");
  assert.equal(rows[0].value, "spring_2028");
});

test("the database itself rejects a value outside the field's allowed list (defense below parseCorrection)", async () => {
  await assert.rejects(
    saveCorrection(db.q, UID, { role_id: VALID_ROLE_ID, field: "season", value: "winter" }, NOW),
    /DB_QUERY_FAILED \(role_corrections\)/,
  );
});

test("removeCorrection deletes only the matching (uid, role, field) row", async () => {
  await insertRow(db.q, "role_corrections", { user_id: UID, role_id: VALID_ROLE_ID, field: "season", value: "fall_2027" });
  // "other" (not a new-taxonomy value like "software"): db/lakebase/001-schema.sql's
  // role_corrections_allowed_value_check still lists the OLD family taxonomy
  // — a real, out-of-fence gap the VTHacks speed pass flags but does not fix
  // (see the build handoff). "other" is valid under both taxonomies, so this
  // deletion-scoping test is unaffected by that pending migration.
  await insertRow(db.q, "role_corrections", { user_id: UID, role_id: VALID_ROLE_ID, field: "family", value: "other" });
  await insertRow(db.q, "role_corrections", { user_id: OTHER_UID, role_id: VALID_ROLE_ID, field: "season", value: "coop" });

  await removeCorrection(db.q, UID, VALID_ROLE_ID, "season");

  assert.deepEqual(
    (await correctionRows()).map((r) => ({ user_id: r.user_id, field: r.field })),
    [
      { user_id: UID, field: "family" },
      { user_id: OTHER_UID, field: "season" },
    ],
  );
});

// --- overlayCorrections --------------------------------------------------

type FakeRow = {
  id: string;
  season: string;
  family: string;
  families: string[];
  visa_class: string | null;
  eligibility_note: string | null;
};

function row(id: string): FakeRow {
  return {
    id,
    season: "unspecified",
    family: "other",
    families: ["other"],
    visa_class: null,
    eligibility_note: "Posting says: something.",
  };
}

test("overlayCorrections: season override", () => {
  const rows = [row(VALID_ROLE_ID)];
  const corrections: Correction[] = [{ role_id: VALID_ROLE_ID, field: "season", value: "fall_2027" }];
  const [out] = overlayCorrections(rows, corrections);
  assert.equal(out.season, "fall_2027");
  assert.deepEqual(out.corrected, ["season"]);
});

test("overlayCorrections: family override sets both family and families", () => {
  const rows = [row(VALID_ROLE_ID)];
  const corrections: Correction[] = [{ role_id: VALID_ROLE_ID, field: "family", value: "data_ai" }];
  const [out] = overlayCorrections(rows, corrections);
  assert.equal(out.family, "data_ai");
  assert.deepEqual(out.families, ["data_ai"]);
});

test("overlayCorrections: visa_class override nulls eligibility_note", () => {
  const rows = [row(VALID_ROLE_ID)];
  const corrections: Correction[] = [{ role_id: VALID_ROLE_ID, field: "visa_class", value: "clean" }];
  const [out] = overlayCorrections(rows, corrections);
  assert.equal(out.visa_class, "clean");
  assert.equal(out.eligibility_note, null);
});

test("overlayCorrections: uncorrected rows get corrected: []", () => {
  const rows = [row(VALID_ROLE_ID)];
  const [out] = overlayCorrections(rows, []);
  assert.deepEqual(out.corrected, []);
});

// --- fold 2: shared labels -----------------------------------------------

test("overlayCorrections: a corrected row carries shared with the pre-overlay values", () => {
  const rows = [row(VALID_ROLE_ID)];
  const corrections: Correction[] = [{ role_id: VALID_ROLE_ID, field: "season", value: "fall_2027" }];
  const [out] = overlayCorrections(rows, corrections);
  assert.deepEqual(out.shared, {
    season: "unspecified",
    family: "other",
    families: ["other"],
    visa_class: null,
    eligibility_note: "Posting says: something.",
  });
  // the row's patched season is the CORRECTED value, never the shared one
  assert.equal(out.season, "fall_2027");
});

test("overlayCorrections: an uncorrected row gets shared: null", () => {
  const rows = [row(VALID_ROLE_ID)];
  const [out] = overlayCorrections(rows, []);
  assert.equal(out.shared, null);
});

test("overlayCorrections: shared is a fresh object — mutating it never touches the input row", () => {
  const rows = [row(VALID_ROLE_ID)];
  const corrections: Correction[] = [{ role_id: VALID_ROLE_ID, field: "family", value: "data_ai" }];
  const [out] = overlayCorrections(rows, corrections);
  assert.notEqual(out.shared, null);
  const shared = out.shared!;
  shared.families.push("mutated");
  assert.deepEqual(rows[0].families, ["other"], "the input row's families array must be untouched");
});

test("overlayCorrections: multiple corrections on one row still carry ONE shared snapshot of the true pre-overlay values", () => {
  const rows = [row(VALID_ROLE_ID)];
  const corrections: Correction[] = [
    { role_id: VALID_ROLE_ID, field: "season", value: "fall_2027" },
    { role_id: VALID_ROLE_ID, field: "family", value: "data_ai" },
  ];
  const [out] = overlayCorrections(rows, corrections);
  assert.deepEqual(out.shared, {
    season: "unspecified",
    family: "other",
    families: ["other"],
    visa_class: null,
    eligibility_note: "Posting says: something.",
  });
});

test("overlayCorrections: input rows are unchanged afterwards (deep-equal snapshot)", () => {
  const rows = [row(VALID_ROLE_ID), row(OTHER_ROLE_ID)];
  const before = structuredClone(rows);
  const corrections: Correction[] = [
    { role_id: VALID_ROLE_ID, field: "season", value: "fall_2027" },
    { role_id: VALID_ROLE_ID, field: "family", value: "data_ai" },
    { role_id: VALID_ROLE_ID, field: "visa_class", value: "no_sponsors" },
  ];
  overlayCorrections(rows, corrections);
  assert.deepEqual(rows, before);
});

test("overlayCorrections: a correction for a role not in rows is ignored", () => {
  const rows = [row(VALID_ROLE_ID)];
  const corrections: Correction[] = [{ role_id: "99999999-9999-9999-9999-999999999999", field: "season", value: "fall_2027" }];
  const [out] = overlayCorrections(rows, corrections);
  assert.equal(out.season, "unspecified");
  assert.deepEqual(out.corrected, []);
  assert.equal(rows.length, 1);
});

// --- structural: never a write to public.roles --------------------------

test("lib/corrections.ts and the correction actions in app/role-actions.ts never write to the shared roles table", () => {
  const correctionsSrc = readFileSync(join(ROOT, "lib", "corrections.ts"), "utf8");
  const actionsSrc = readFileSync(join(ROOT, "app", "role-actions.ts"), "utf8");
  const WRITES_ROLES = /\b(?:update|insert\s+into|delete\s+from)\s+roles\b/i;
  assert.doesNotMatch(correctionsSrc, WRITES_ROLES, "lib/corrections.ts must never write to roles");
  assert.doesNotMatch(actionsSrc, WRITES_ROLES, "app/role-actions.ts must never write to roles");
  // sanity: the file actually contains the two actions this test is meant to guard.
  assert.match(actionsSrc, /export async function correctRoleAction/);
  assert.match(actionsSrc, /export async function uncorrectRoleAction/);
});

test("CORRECTION_FIELDS matches the migration's field check constraint", () => {
  assert.deepEqual([...CORRECTION_FIELDS], ["season", "family", "visa_class"]);
});
