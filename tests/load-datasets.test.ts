import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  TABLES,
  missingMessage,
  validateHeader,
  validateRows,
  sqlLiteral,
  createTableSql,
  buildInsertStatements,
} from "../scripts/load-datasets.mjs";

test("a missing file yields the MISSING line with the full expected header", () => {
  const table = TABLES.vt_courses;
  const filePath = path.join("C:", "datasets", "vt_courses.csv");
  const message = missingMessage(table, filePath);
  assert.equal(
    message,
    `MISSING vt_courses.csv: expected ${filePath} with columns code, title, description, credits, department, level, prereqs`,
  );
});

test("a misspelled column is refused naming both the expected and the unexpected column", () => {
  const table = TABLES.vt_courses;
  // "credit" instead of "credits": one column missing, one column unexpected.
  const actual = ["code", "title", "description", "credit", "department", "level", "prereqs"];
  const message = validateHeader(table, actual);
  assert.match(message ?? "", /expected column "credits" not found/);
  assert.match(message ?? "", /unexpected column "credit"/);
});

test("an exact header (order-insensitive) is accepted", () => {
  const table = TABLES.vt_clubs;
  const reordered = ["url", "name", "category", "description"];
  assert.equal(validateHeader(table, reordered), null);
});

test("an empty required field is rejected by row and column", () => {
  const table = TABLES.vt_majors;
  const header = ["major", "college", "degree"];
  const rows = [
    ["Computer Science", "Engineering", "BS"],
    ["", "Engineering", "BS"],
  ];
  const errors = validateRows(table, header, rows);
  assert.deepEqual(errors, ['row 3 column "major" is empty']);
});

test("an empty optional field (prereqs) is not rejected", () => {
  const table = TABLES.vt_courses;
  const header = ["code", "title", "description", "credits", "department", "level", "prereqs"];
  const rows = [["CS 3114", "Data Structures", "desc", "3", "CS", "3000", ""]];
  assert.deepEqual(validateRows(table, header, rows), []);
});

test("sqlLiteral escapes a single quote", () => {
  assert.equal(sqlLiteral("O'Brien's Club", "string"), "'O''Brien''s Club'");
});

test("sqlLiteral renders an empty value as NULL, and a number unquoted", () => {
  assert.equal(sqlLiteral("", "string"), "NULL");
  assert.equal(sqlLiteral("3.5", "double"), "3.5");
});

test("createTableSql types credits/level numeric and ids string", () => {
  const sql = createTableSql("scout.core.vt_courses", TABLES.vt_courses);
  assert.match(sql, /credits DOUBLE/);
  assert.match(sql, /level INT/);
  assert.match(sql, /code STRING/);
  assert.match(sql, /using delta$/);
});

test("buildInsertStatements batches under the byte ceiling and escapes quotes", () => {
  const table = TABLES.vt_clubs;
  const header = ["name", "description", "category", "url"];
  const rows = [
    ["Ballroom Dance Club", "VT's premier dance org", "cultural", "https://example.edu/a"],
    ["O'Brien's Debate Society", "argue about stuff", "other", "https://example.edu/b"],
  ];
  const statements = buildInsertStatements("scout.core.vt_clubs", table, header, rows, 900_000);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /insert into scout\.core\.vt_clubs \(name, description, category, url\) values/);
  assert.match(statements[0], /O''Brien''s Debate Society/);
});

test("buildInsertStatements splits into multiple statements past the byte ceiling", () => {
  const table = TABLES.vt_majors;
  const header = ["major", "college", "degree"];
  const rows = Array.from({ length: 10 }, (_, i) => [`Major ${i}`, "College of Testing", "BS"]);
  const statements = buildInsertStatements("scout.core.vt_majors", table, header, rows, 120);
  assert.ok(statements.length > 1);
  for (const statement of statements) {
    assert.ok(statement.length < 400); // well under the deliberately tiny ceiling plus one row
  }
});
