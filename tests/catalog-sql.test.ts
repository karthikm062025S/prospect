import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sqlEscape,
  loadCourseCandidates,
  loadClubCandidates,
  courseCodesExist,
  clubNamesExist,
  type ExecuteFn,
} from "../lib/catalog.ts";

/** A fake `exec` (the Databricks boundary): `count(*)` queries return `countRows`, every other statement is captured and answered by `onSelect`. */
function fakeExec(countRows: number, onSelect: (sql: string) => unknown[][]): { exec: ExecuteFn; statements: string[] } {
  const statements: string[] = [];
  const exec: ExecuteFn = async (sql: string) => {
    statements.push(sql);
    if (sql.includes("count(*)")) return { columns: ["n"], rows: [[countRows]] };
    return { columns: [], rows: onSelect(sql) };
  };
  return { exec, statements };
}

/** Mimics lib/databricks-sql.ts's env-configuration error, unwrapped exactly as requiredEnv() throws it. */
function envErrorExec(name: string): ExecuteFn {
  return async () => {
    throw new Error(`${name} is not set`);
  };
}

/** Mimics a FAILED statement state (e.g. TABLE_OR_VIEW_NOT_FOUND) the way lib/databricks-sql.ts wraps it. */
function failedStatementExec(): ExecuteFn {
  return async () => {
    throw new Error("DATABRICKS_STATEMENT_FAILED: [TABLE_OR_VIEW_NOT_FOUND] scout.core.vt_courses");
  };
}

test("sqlEscape doubles a single quote", () => {
  assert.equal(sqlEscape("O'Brien's Club"), "O''Brien''s Club");
});

test("sqlEscape leaves a string with no quotes unchanged", () => {
  assert.equal(sqlEscape("CS 3114"), "CS 3114");
});

test("Databricks env missing surfaces verbatim, never masked as 'catalog not loaded'", async () => {
  await assert.rejects(
    loadCourseCandidates({ limit: 10, exec: envErrorExec("DATABRICKS_HOST") }),
    /^Error: DATABRICKS_HOST is not set$/,
  );
});

test("an empty (0-row) course table throws the exact 'Course catalog not loaded' message", async () => {
  const { exec } = fakeExec(0, () => []);
  await assert.rejects(
    loadCourseCandidates({ limit: 10, exec }),
    /^Error: Course catalog not loaded: expected datasets\/vt_courses\.csv with columns code, title, description, credits, department, level, prereqs$/,
  );
});

test("an empty (0-row) club table throws the exact 'Club catalog not loaded' message", async () => {
  const { exec } = fakeExec(0, () => []);
  await assert.rejects(
    loadClubCandidates({ limit: 10, exec }),
    /^Error: Club catalog not loaded: expected datasets\/vt_clubs\.csv with columns name, description, category, url$/,
  );
});

test("a missing (never-created) course table also becomes the named 'not loaded' message, not the raw Databricks error", async () => {
  await assert.rejects(
    loadCourseCandidates({ limit: 10, exec: failedStatementExec() }),
    /^Error: Course catalog not loaded: expected datasets\/vt_courses\.csv with columns code, title, description, credits, department, level, prereqs$/,
  );
});

test("loadCourseCandidates escapes a quote inside a keyword before it reaches the SQL string", async () => {
  const { exec, statements } = fakeExec(1, () => []);
  await loadCourseCandidates({ keywords: ["O'Reilly"], limit: 10, exec });
  const selectSql = statements.find((s) => !s.includes("count(*)"))!;
  assert.match(selectSql, /O''Reilly/);
  assert.doesNotMatch(selectSql, /'O'Reilly'/); // the raw unescaped quote never appears bare
});

test("loadClubCandidates limits and quotes a category list", async () => {
  const { exec, statements } = fakeExec(1, () => []);
  await loadClubCandidates({ categories: ["cultural", "O'Brien's"], limit: 5, exec });
  const selectSql = statements.find((s) => !s.includes("count(*)"))!;
  assert.match(selectSql, /category in \('cultural', 'O''Brien''s'\)/);
  assert.match(selectSql, /limit 5$/);
});

test("courseCodesExist returns an empty set with no query at all when given no codes", async () => {
  let called = false;
  const exec: ExecuteFn = async () => {
    called = true;
    return { columns: [], rows: [] };
  };
  const result = await courseCodesExist([], exec);
  assert.deepEqual(result, new Set());
  assert.equal(called, false);
});

test("courseCodesExist returns exactly the codes the catalog reports back", async () => {
  const { exec } = fakeExec(5, () => [["CS 3114"]]);
  const result = await courseCodesExist(["CS 3114", "CS 9999"], exec);
  assert.deepEqual(result, new Set(["CS 3114"]));
});

test("clubNamesExist returns exactly the names the catalog reports back", async () => {
  const { exec } = fakeExec(2, () => [["ACM"]]);
  const result = await clubNamesExist(["ACM", "Not A Club"], exec);
  assert.deepEqual(result, new Set(["ACM"]));
});

test("clubNamesExist escapes an apostrophe in a candidate name", async () => {
  const { exec, statements } = fakeExec(1, () => [["O'Brien's Debate Society"]]);
  await clubNamesExist(["O'Brien's Debate Society"], exec);
  const selectSql = statements.find((s) => !s.includes("count(*)"))!;
  assert.match(selectSql, /O''Brien''s Debate Society/);
});
