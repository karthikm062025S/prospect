import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { QueryFn } from "../lib/db.ts";
import { assignArchetypesBatch } from "../lib/agents/match.ts";
import { setRoleArchetype } from "../lib/archetypes.ts";

// D-S1: the bulk assignment runs against the real schema (001 roles/companies
// + 005 archetypes) in pglite with a fake Vector Search (the HTTP boundary,
// never job-posting data). Proves the SQL: only OPEN postings with no
// archetype, newest first, capped by limit, and the remaining count.
const SCHEMA = fs.readFileSync("db/lakebase/001-schema.sql", "utf8");
const ARCHETYPES = fs.readFileSync("db/lakebase/005-archetypes.sql", "utf8");

async function makeDb(): Promise<QueryFn> {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(ARCHETYPES);
  return async (text, params = []) => (await db.query(text, params as unknown[])).rows as never;
}

test("assignArchetypesBatch assigns vector top-1 to unassigned open postings, newest first, up to limit, and reports the rest", async () => {
  const q = await makeDb();
  const [company] = await q<{ id: string }>("insert into companies (name) values ('Acme') returning id");
  const [archetype] = await q<{ id: string }>(
    "insert into archetypes (name, definition, status) values ('Backend Software Engineer', 'Builds APIs.', 'confirmed') returning id",
  );
  const titles = ["Oldest Intern", "Middle Intern", "Newest Intern", "Applied Intern", "Already Assigned Intern"];
  const ids: Record<string, string> = {};
  for (const [i, title] of titles.entries()) {
    const [row] = await q<{ id: string }>(
      "insert into roles (company_id, title, lifecycle, created_at) values ($1, $2, $3, now() - ($4 || ' days')::interval) returning id",
      [company.id, title, title === "Applied Intern" ? "applied" : "open", String(10 - i)],
    );
    ids[title] = row.id;
  }
  await setRoleArchetype(q, ids["Already Assigned Intern"], archetype.id, 0.9, "vector");

  const queried: string[] = [];
  const fakeQueryIndex = (async (input: { text: string }) => {
    queried.push(input.text);
    return [{ id: archetype.id, name: "Backend Software Engineer", score: 0.42 }];
  }) as typeof import("../lib/vector-search.ts").queryIndex;

  const first = await assignArchetypesBatch(q, { limit: 2, concurrency: 2 }, { queryIndex: fakeQueryIndex, setRoleArchetype });
  assert.deepEqual(first, { assigned: 2, remaining: 1 });
  assert.deepEqual(queried, ["Newest Intern", "Middle Intern"]);

  const second = await assignArchetypesBatch(q, { limit: 100, concurrency: 2 }, { queryIndex: fakeQueryIndex, setRoleArchetype });
  assert.deepEqual(second, { assigned: 1, remaining: 0 });
  assert.deepEqual(queried, ["Newest Intern", "Middle Intern", "Oldest Intern"]);

  const stored = await q<{ role_id: string; confidence: number; decided_by: string }>(
    "select role_id, confidence, decided_by from role_archetypes where role_id = $1",
    [ids["Newest Intern"]],
  );
  assert.deepEqual(stored, [{ role_id: ids["Newest Intern"], confidence: 0.42, decided_by: "vector" }]);

  const nothingLeft = await assignArchetypesBatch(q, { limit: 100, concurrency: 2 }, { queryIndex: fakeQueryIndex, setRoleArchetype });
  assert.deepEqual(nothingLeft, { assigned: 0, remaining: 0 });
});
