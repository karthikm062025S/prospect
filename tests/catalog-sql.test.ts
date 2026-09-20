import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import type { QueryFn } from "../lib/db.ts";
import { loadCourseCandidates, loadClubCandidates, courseCodesExist, clubNamesExist, searchCatalog } from "../lib/catalog.ts";

// Same shape as tests/archetypes-sql.test.ts / tests/match-sql.test.ts: the
// real migration file applied to an in-process Postgres (pglite, with the
// pg_trgm extension 007 creates), and a `q` with lib/db.ts's error wrapping.
const CATALOG_SQL = fs.readFileSync("db/lakebase/007-catalog.sql", "utf8");

async function makeDb(sql = CATALOG_SQL): Promise<QueryFn> {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(sql);
  return async (text, params = [], table) => {
    try {
      const result = await db.query(text, params as unknown[]);
      return result.rows as never;
    } catch (error) {
      const where = table ? ` (${table})` : "";
      throw new Error(`DB_QUERY_FAILED${where}: ${(error as Error).message}`, { cause: error });
    }
  };
}

const COURSE_NOT_LOADED =
  /^Error: Course catalog not loaded: expected datasets\/vt_courses\.csv with columns code, title, description, credits, department, level, prereqs$/;
const CLUB_NOT_LOADED = /^Error: Club catalog not loaded: expected datasets\/vt_clubs\.csv with columns name, description, category, url$/;

async function seed(q: QueryFn): Promise<void> {
  await q(
    `insert into vt_courses (code, title, description, credits, department, level, prereqs) values
     ('CS 3114', 'Data Structures and Algorithms', 'Trees, graphs, hashing.', 3, 'CS', 3000, 'CS 2114'),
     ('CS 4804', 'Introduction to Artificial Intelligence', 'Search, knowledge representation.', 3, 'CS', 4000, null),
     ('ACIS 2115', 'Principles of Accounting', 'Financial accounting basics.', 3, 'ACIS', 2000, null)`,
  );
  await q(
    `insert into vt_clubs (name, description, category, url) values
     ('ACM at Virginia Tech', 'Computing society; algorithms study groups.', 'Academic', 'https://acm.vt.edu'),
     ('O''Brien''s Debate Society', 'Debate.', 'Academic', 'https://example.org')`,
  );
}

test("007-catalog.sql applies cleanly and is idempotent (create ... if not exists, including the trigram indexes)", async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(CATALOG_SQL);
  await db.exec(CATALOG_SQL);
  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  assert.deepEqual(
    tables.rows.map((r) => r.table_name),
    ["task_exposure", "vt_clubs", "vt_courses"],
  );
  const indexes = await db.query<{ indexname: string }>("select indexname from pg_indexes where indexname like '%trgm%' order by 1");
  assert.deepEqual(
    indexes.rows.map((r) => r.indexname),
    ["vt_clubs_name_trgm_idx", "vt_courses_code_trgm_idx", "vt_courses_title_trgm_idx"],
  );
});

test("a missing (never-created) course table becomes the named 'not loaded' message, not the raw pg error", async () => {
  const q = await makeDb("select 1"); // no migration applied
  await assert.rejects(loadCourseCandidates({ limit: 10, q }), COURSE_NOT_LOADED);
  await assert.rejects(courseCodesExist(["CS 3114"], q), COURSE_NOT_LOADED);
});

test("an empty (0-row) course / club table throws the exact 'not loaded' message", async () => {
  const q = await makeDb();
  await assert.rejects(loadCourseCandidates({ limit: 10, q }), COURSE_NOT_LOADED);
  await assert.rejects(loadClubCandidates({ limit: 10, q }), CLUB_NOT_LOADED);
  await assert.rejects(clubNamesExist(["ACM"], q), CLUB_NOT_LOADED);
});

test("a DATABASE_NOT_CONFIGURED error surfaces verbatim, never masked as 'catalog not loaded'", async () => {
  const q: QueryFn = async () => {
    throw new Error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set");
  };
  await assert.rejects(loadCourseCandidates({ limit: 10, q }), /^Error: DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set$/);
});

test("loadCourseCandidates matches keywords case-insensitively on title or description, with a quote-safe parameter", async () => {
  const q = await makeDb();
  await seed(q);
  const byTitle = await loadCourseCandidates({ keywords: ["artificial"], limit: 10, q });
  assert.deepEqual(byTitle.map((c) => c.code), ["CS 4804"]);
  const byDescription = await loadCourseCandidates({ keywords: ["hashing"], limit: 10, q });
  assert.deepEqual(byDescription.map((c) => c.code), ["CS 3114"]);
  assert.equal(byDescription[0].credits, 3);
  assert.equal(byDescription[0].level, 3000);
  assert.equal(byDescription[0].prereqs, "CS 2114");
  const quoted = await loadCourseCandidates({ keywords: ["O'Reilly"], limit: 10, q });
  assert.deepEqual(quoted, []);
});

test("loadCourseCandidates: departments OR keywords, honoring limit", async () => {
  const q = await makeDb();
  await seed(q);
  const rows = await loadCourseCandidates({ departments: ["ACIS"], keywords: ["algorithms"], limit: 10, q });
  assert.deepEqual(rows.map((c) => c.code), ["ACIS 2115", "CS 3114"]);
  const limited = await loadCourseCandidates({ limit: 1, q });
  assert.equal(limited.length, 1);
});

test("loadClubCandidates filters by category list and keyword", async () => {
  const q = await makeDb();
  await seed(q);
  const rows = await loadClubCandidates({ categories: ["Academic"], limit: 5, q });
  assert.deepEqual(rows.map((c) => c.name), ["ACM at Virginia Tech", "O'Brien's Debate Society"]);
  const byKeyword = await loadClubCandidates({ keywords: ["computing"], limit: 5, q });
  assert.deepEqual(byKeyword.map((c) => c.name), ["ACM at Virginia Tech"]);
  assert.equal(byKeyword[0].url, "https://acm.vt.edu");
});

test("courseCodesExist returns an empty set with no query at all when given no codes", async () => {
  let called = false;
  const q: QueryFn = async () => {
    called = true;
    return [];
  };
  assert.deepEqual(await courseCodesExist([], q), new Set());
  assert.equal(called, false);
});

test("courseCodesExist / clubNamesExist return exactly the catalog rows that exist (apostrophes intact)", async () => {
  const q = await makeDb();
  await seed(q);
  assert.deepEqual(await courseCodesExist(["CS 3114", "CS 9999"], q), new Set(["CS 3114"]));
  assert.deepEqual(await clubNamesExist(["ACM at Virginia Tech", "Not A Club", "O'Brien's Debate Society"], q), new Set(["ACM at Virginia Tech", "O'Brien's Debate Society"]));
});

test("searchCatalog returns courses (by code or title) and clubs (by name or description) from one statement", async () => {
  const q = await makeDb();
  await seed(q);
  const byCode = await searchCatalog("cs 3", 20, q);
  assert.deepEqual(byCode.courses.map((c) => c.code), ["CS 3114"]);
  assert.deepEqual(byCode.clubs, []);
  const both = await searchCatalog("algorithm", 20, q);
  assert.deepEqual(both.courses, [{ code: "CS 3114", title: "Data Structures and Algorithms" }]);
  assert.deepEqual(both.clubs, [{ name: "ACM at Virginia Tech", description: "Computing society; algorithms study groups." }]);
  const limited = await searchCatalog("a", 1, q);
  assert.equal(limited.courses.length, 1);
  assert.equal(limited.clubs.length, 1);
});
