import { test } from "node:test";
import assert from "node:assert/strict";
import { TABLES, missingColumn, toRecords, upsertSql } from "../scripts/load-lakebase-catalog.mjs";

test("a required column missing from the header is refused by name", () => {
  const msg = missingColumn(TABLES.task_exposure, ["task_id", "onet_soc_code", "augmentation_share", "source"]);
  assert.match(msg!, /^REFUSED task_exposure\.csv: expected column "automation_share" not found/);
  assert.equal(missingColumn(TABLES.task_exposure, ["source", "augmentation_share", "automation_share", "task_id"]), null);
});

test("toRecords maps columns by header name, ignores extras, coerces numbers and collapses duplicate keys (last wins)", () => {
  const header = ["source", "augmentation_share", "task_id", "automation_share", "onet_soc_code"];
  const rows = [
    ["aei", "0.6", "8823", "0.4", "11-1011.00"],
    ["aei", "0.9", "8823", "0.1", "11-1011.00"],
    ["aei", "0.5", "8824", "0.5", "11-1011.00"],
  ];
  const { records, duplicates } = toRecords(TABLES.task_exposure, header, rows);
  assert.equal(duplicates, 1);
  assert.deepEqual(records, [
    { task_id: "8823", automation_share: 0.1, augmentation_share: 0.9 },
    { task_id: "8824", automation_share: 0.5, augmentation_share: 0.5 },
  ]);
});

test("an empty required cell fails by row and column; an empty optional cell becomes null", () => {
  const header = ["code", "title", "description", "credits", "department", "level", "prereqs"];
  assert.throws(
    () => toRecords(TABLES.vt_courses, header, [["CS 3114", "", "d", "3", "CS", "3000", ""]]),
    /row 2 column "title" is empty/,
  );
  const { records } = toRecords(TABLES.vt_courses, header, [["CS 3114", "Data Structures", "d", "3", "CS", "3000", ""]]);
  assert.equal(records[0].prereqs, null);
  assert.equal(records[0].level, 3000);
});

test("upsertSql is a parameterized ON CONFLICT upsert keyed by the primary key", () => {
  const sql = upsertSql("vt_clubs", TABLES.vt_clubs, 2);
  assert.equal(
    sql,
    "insert into vt_clubs (name, description, category, url) values ($1, $2, $3, $4), ($5, $6, $7, $8) on conflict (name) do update set description = excluded.description, category = excluded.category, url = excluded.url",
  );
});
