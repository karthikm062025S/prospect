#!/usr/bin/env node
// Validates and lands the L3 datasets (SETUP.md §6) into Databricks Delta
// tables (scout.core.<name>) through the SQL warehouse. Never invents a row:
// a missing file is reported by name with its expected path and header; a
// wrong header names the column expected and the column found; an empty
// required field names its row and column. `--validate-only` needs no env at
// all and never talks to Databricks.
//
// Node 22.19 strips erasable TypeScript syntax by default (confirmed
// 2026-09-19: `node script.mjs` importing a plain-annotation `.ts` file works
// with no flag), so this file imports lib/csv.ts and lib/databricks-sql.ts
// directly instead of duplicating them.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCsv } from "../lib/csv.ts";
import { executeStatement } from "../lib/databricks-sql.ts";

// column.type: "string" | "double" | "int". "optional" columns may be empty
// (e.g. a course with no prerequisites); every other column is required.
export const TABLES = {
  vt_courses: {
    file: "vt_courses.csv",
    columns: [
      { name: "code", type: "string" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "credits", type: "double" },
      { name: "department", type: "string" },
      { name: "level", type: "int" },
      { name: "prereqs", type: "string", optional: true },
    ],
  },
  vt_clubs: {
    file: "vt_clubs.csv",
    columns: [
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "category", type: "string" },
      { name: "url", type: "string" },
    ],
  },
  vt_majors: {
    file: "vt_majors.csv",
    columns: [
      { name: "major", type: "string" },
      { name: "college", type: "string" },
      { name: "degree", type: "string" },
    ],
  },
  vt_checksheets: {
    // Degree checksheets: one row per course line (required + elective) per major (Karthik 2026-09-19 17:05).
    file: "vt_checksheets.csv",
    columns: [
      { name: "major", type: "string" },
      { name: "college", type: "string" },
      { name: "catalog_year", type: "string" },
      { name: "requirement_group", type: "string" },
      { name: "course_code", type: "string" },
      { name: "course_title", type: "string" },
      { name: "credits", type: "string" },
      { name: "notes", type: "string", optional: true },
    ],
  },
  onet_tasks: {
    file: "onet_tasks.csv",
    columns: [
      { name: "onet_soc_code", type: "string" },
      { name: "task_id", type: "string" },
      { name: "task_statement", type: "string" },
    ],
  },
  task_exposure: {
    file: "task_exposure.csv",
    columns: [
      { name: "task_id", type: "string" },
      { name: "onet_soc_code", type: "string" },
      { name: "automation_share", type: "double" },
      { name: "augmentation_share", type: "double" },
      { name: "source", type: "string" },
    ],
  },
};

export function expectedHeader(table) {
  return table.columns.map((c) => c.name);
}

export function missingMessage(table, filePath) {
  return `MISSING ${table.file}: expected ${filePath} with columns ${expectedHeader(table).join(", ")}`;
}

/** null when the header matches (order-insensitive); else a message naming both the expected and unexpected column. */
export function validateHeader(table, actualHeader) {
  const expected = expectedHeader(table);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actualHeader);
  const missing = expected.filter((c) => !actualSet.has(c));
  const unexpected = actualHeader.filter((c) => !expectedSet.has(c));
  if (missing.length === 0 && unexpected.length === 0) return null;
  const parts = [];
  if (missing.length > 0) parts.push(`expected column "${missing[0]}" not found`);
  if (unexpected.length > 0) parts.push(`unexpected column "${unexpected[0]}"`);
  return `REFUSED ${table.file}: ${parts.join("; ")}`;
}

/** Row numbers count the header as row 1, so the first data row is row 2. */
export function validateRows(table, header, rows) {
  const required = table.columns.filter((c) => !c.optional).map((c) => c.name);
  const index = new Map(header.map((name, i) => [name, i]));
  const errors = [];
  rows.forEach((row, i) => {
    for (const col of required) {
      const idx = index.get(col);
      const value = idx === undefined ? undefined : row[idx];
      if (value === undefined || value.trim() === "") {
        errors.push(`row ${i + 2} column "${col}" is empty`);
      }
    }
  });
  return errors;
}

export function sqlLiteral(value, type) {
  if (value === undefined || value === "") return "NULL";
  if (type === "double" || type === "int") {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`Cannot parse numeric value: "${value}"`);
    return String(n);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlType(type) {
  if (type === "double") return "DOUBLE";
  if (type === "int") return "INT";
  return "STRING";
}

export function createTableSql(tableName, table) {
  const cols = table.columns.map((c) => `${c.name} ${sqlType(c.type)}`).join(", ");
  return `create table if not exists ${tableName} (${cols}) using delta`;
}

/** Batches rows into `insert into ... values (...), (...)` statements, each under ~maxBytes. */
export function buildInsertStatements(tableName, table, header, rows, maxBytes = 900_000) {
  const index = new Map(header.map((name, i) => [name, i]));
  const columnNames = table.columns.map((c) => c.name);
  const prefix = `insert into ${tableName} (${columnNames.join(", ")}) values `;
  const statements = [];
  let batch = [];
  let bytes = prefix.length;
  for (const row of rows) {
    const literal =
      "(" + table.columns.map((c) => sqlLiteral(row[index.get(c.name)], c.type)).join(", ") + ")";
    const addedBytes = literal.length + 2;
    if (batch.length > 0 && bytes + addedBytes > maxBytes) {
      statements.push(prefix + batch.join(", "));
      batch = [];
      bytes = prefix.length;
    }
    batch.push(literal);
    bytes += addedBytes;
  }
  if (batch.length > 0) statements.push(prefix + batch.join(", "));
  return statements;
}

function parseArgs(argv) {
  const args = { dir: null, validateOnly: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") args.dir = argv[++i];
    else if (argv[i] === "--validate-only") args.validateOnly = true;
    else if (argv[i] === "--only") args.only = argv[++i].split(",").map((s) => s.trim());
  }
  return args;
}

async function main() {
  const { dir, validateOnly, only } = parseArgs(process.argv.slice(2));
  if (!dir) {
    console.error("Usage: node scripts/load-datasets.mjs --dir <path> [--validate-only] [--only a,b]");
    process.exit(1);
  }

  const names = only ?? Object.keys(TABLES);
  let allOk = true;

  for (const name of names) {
    const table = TABLES[name];
    if (!table) {
      console.log(`UNKNOWN dataset: ${name}`);
      allOk = false;
      continue;
    }

    const filePath = path.join(dir, table.file);
    if (!existsSync(filePath)) {
      console.log(missingMessage(table, filePath));
      allOk = false;
      continue;
    }

    const text = readFileSync(filePath, "utf-8");
    const { header, rows } = parseCsv(text);

    const headerError = validateHeader(table, header);
    if (headerError) {
      console.log(headerError);
      allOk = false;
      continue;
    }

    const rowErrors = validateRows(table, header, rows);
    if (rowErrors.length > 0) {
      const shown = rowErrors.slice(0, 5).join("; ");
      const more = rowErrors.length > 5 ? ` (+${rowErrors.length - 5} more)` : "";
      console.log(`REFUSED ${table.file}: ${rowErrors.length} invalid row(s): ${shown}${more}`);
      allOk = false;
      continue;
    }

    console.log(`OK ${table.file}: ${rows.length} rows`);
    if (validateOnly) continue;

    const tableName = `scout.core.${name}`;
    await executeStatement(createTableSql(tableName, table));
    await executeStatement(`delete from ${tableName}`);
    const statements = buildInsertStatements(tableName, table, header, rows);
    for (const statement of statements) {
      await executeStatement(statement);
    }
    const countResult = await executeStatement(`select count(*) as n from ${tableName}`);
    const n = countResult.rows[0]?.[0];
    console.log(`LOADED ${tableName}: ${n} rows`);
  }

  process.exit(allOk ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
