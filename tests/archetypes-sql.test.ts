import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { listArchetypes, upsertArchetype, setRoleArchetype, type QueryFn } from "../lib/archetypes.ts";

const ARCHETYPES_SQL = fs.readFileSync("db/lakebase/005-archetypes.sql", "utf8");

async function makeDb(): Promise<QueryFn> {
  const db = new PGlite();
  await db.exec(ARCHETYPES_SQL);
  return async (text, params = []) => {
    const result = await db.query(text, params as unknown[]);
    return result.rows as never[];
  };
}

test("005-archetypes.sql applies cleanly and is idempotent (create table if not exists)", async () => {
  const db = new PGlite();
  await db.exec(ARCHETYPES_SQL);
  await db.exec(ARCHETYPES_SQL); // re-apply must not throw
  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  const names = tables.rows.map((r) => r.table_name);
  assert.ok(names.includes("archetypes"));
  assert.ok(names.includes("role_archetypes"));
  assert.ok(names.includes("role_tasks"));
});

test("archetypes.name is unique -- a second row with the same name is refused", async () => {
  const db = new PGlite();
  await db.exec(ARCHETYPES_SQL);
  await db.query(
    `insert into archetypes (name, definition, status) values ('Backend Software Engineer', 'Builds APIs.', 'confirmed')`,
  );
  await assert.rejects(
    db.query(
      `insert into archetypes (name, definition, status) values ('Backend Software Engineer', 'A duplicate.', 'confirmed')`,
    ),
  );
});

test("archetypes.status only accepts confirmed or provisional", async () => {
  const db = new PGlite();
  await db.exec(ARCHETYPES_SQL);
  await db.query(
    `insert into archetypes (name, definition, status) values ('Audit Associate', 'Reviews financial controls.', 'provisional')`,
  );
  const rows = await db.query<{ status: string }>(`select status from archetypes where name = 'Audit Associate'`);
  assert.equal(rows.rows[0].status, "provisional");
  await assert.rejects(
    db.query(`insert into archetypes (name, definition, status) values ('Bad Row', 'x', 'made_up')`),
  );
});

test("role_archetypes.decided_by only accepts vector or gemini", async () => {
  const db = new PGlite();
  await db.exec(ARCHETYPES_SQL);
  const archetype = await db.query<{ id: string }>(
    `insert into archetypes (name, definition, status) values ('Credit Analyst', 'Assesses creditworthiness.', 'confirmed') returning id`,
  );
  const archetypeId = archetype.rows[0].id;
  await assert.rejects(
    db.query(
      `insert into role_archetypes (role_id, archetype_id, decided_by) values (gen_random_uuid(), '${archetypeId}', 'guessed')`,
    ),
  );
});

test("role_tasks.label only accepts human_led, ai_assisted, automatable or unscored", async () => {
  const db = new PGlite();
  await db.exec(ARCHETYPES_SQL);
  const roleId = "11111111-1111-1111-1111-111111111111";
  await db.query(
    `insert into role_tasks (role_id, position, duty, label) values ('${roleId}', 0, 'Write code', 'unscored')`,
  );
  await assert.rejects(
    db.query(
      `insert into role_tasks (role_id, position, duty, label) values ('${roleId}', 1, 'Write code', 'definitely_automatable')`,
    ),
  );
});

test("upsertArchetype inserts then updates the same row by unique name (no duplicate)", async () => {
  const q = await makeDb();
  const created = await upsertArchetype(q, {
    name: "Sales & Trading Analyst",
    definition: "Supports trading desks.",
    status: "confirmed",
  });
  const updated = await upsertArchetype(q, {
    name: "Sales & Trading Analyst",
    definition: "Supports trading desks and executes client orders.",
    aliases: ["S&T Analyst"],
    status: "confirmed",
  });
  assert.equal(updated.id, created.id);
  assert.equal(updated.definition, "Supports trading desks and executes client orders.");

  const all = await listArchetypes(q);
  assert.equal(all.length, 1);
});

test("setRoleArchetype writes a role_archetypes row a second write to the same role updates in place", async () => {
  const q = await makeDb();
  const a = await upsertArchetype(q, { name: "Audit Associate", definition: "Reviews controls.", status: "confirmed" });
  const b = await upsertArchetype(q, { name: "Credit Analyst", definition: "Assesses risk.", status: "provisional" });
  const roleId = "22222222-2222-2222-2222-222222222222";

  await setRoleArchetype(q, roleId, a.id, 0.91, "vector");
  const rows = await q<{ archetype_id: string; decided_by: string }>(
    "select archetype_id, decided_by from role_archetypes where role_id = $1",
    [roleId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].archetype_id, a.id);
  assert.equal(rows[0].decided_by, "vector");

  await setRoleArchetype(q, roleId, b.id, null, "gemini");
  const updated = await q<{ archetype_id: string; decided_by: string }>(
    "select archetype_id, decided_by from role_archetypes where role_id = $1",
    [roleId],
  );
  assert.equal(updated.length, 1);
  assert.equal(updated[0].archetype_id, b.id);
  assert.equal(updated[0].decided_by, "gemini");
});
