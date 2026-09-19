import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// D4 (build/MISSION.md): Supabase RLS scoped every per-user table to
// auth.uid(); Lakebase has one role, so the scoping is EXPLICIT in every
// statement. This static scan reads every SQL string literal under lib/, app/
// and components/ (the dirs tests/db-boundary.test.ts allows to import
// lib/db) that names a per-user table and requires:
//   * select / update / delete: an OWNER PREDICATE `user_id = $n` (or
//     `user_id = any(`) after the first `where` — a mere mention (`select
//     user_id ...`, `where user_id is not null`) is not scoping;
//   * insert into: the literal carries `user_id` (the column is being written).
// A statement that drops the filter leaks every user's rows, so a miss here is
// a failing test, not a warning.
//
// The per-user table list is DERIVED from db/lakebase/*.sql: every `create
// table` whose body declares a `user_id` column. New lanes' tables (profiles,
// roadmaps, nudges, agent_runs, ...) are covered the moment their DDL lands.
const ROOT = resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["lib", "app", "components"];
// Every string literal: template literals (multi-line), double- and single-quoted.
const LITERAL_RE = /`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;
const OWNER_PREDICATE_RE = /\buser_id\s*=\s*(\$\d+|any\()/;

// Service-tier exceptions: each is a statement that legitimately has no owner
// predicate. Keep this list short; every entry names its reason, and every
// entry must still match a real statement (a stale entry fails the test).
const ALLOWLIST: Array<{ file: string; table: string; match: RegExp; reason: string }> = [
  {
    file: "lib/feedback-server.ts",
    table: "feedback",
    match: /count\(\*\)::int as n from feedback where created_at >= \$1 and ip_hash = \$2/,
    reason: "the anonymous per-IP daily cap: an anonymous sender has no user_id, the row is keyed by ip_hash",
  },
  {
    file: "lib/feedback-server.ts",
    table: "feedback",
    match: /count\(\*\)::int as n from feedback where created_at >= \$1["`]$/,
    reason: "the global daily ceiling (200/day across every sender) is a count over all rows by design",
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
const repoPath = (path: string) => relative(ROOT, path).split(sep).join("/");

/** Tables whose `create table` body declares a user_id column, from every db/lakebase/*.sql. */
export function userTablesFromDdl(sql: string): string[] {
  const tables: string[] = [];
  const CREATE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s*\(/gi;
  for (const m of sql.matchAll(CREATE_RE)) {
    // Walk to the matching close paren (bodies nest parens in CHECKs).
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    while (i < sql.length && depth > 0) {
      if (sql[i] === "(") depth += 1;
      else if (sql[i] === ")") depth -= 1;
      i += 1;
    }
    const body = sql.slice(start, i - 1).replace(/--[^\n]*/g, "");
    if (/(^|[\s,(])user_id\s+uuid\b/i.test(body)) tables.push(m[1].toLowerCase());
  }
  return tables;
}

const USER_TABLES = [
  ...new Set(
    readdirSync(join(ROOT, "db", "lakebase"))
      .filter((name) => name.endsWith(".sql"))
      .flatMap((name) => userTablesFromDdl(readFileSync(join(ROOT, "db", "lakebase", name), "utf8"))),
  ),
].sort();

type Hit = { file: string; table: string; literal: string; why: string };

/** Every SQL literal naming a per-user table that fails the scoping rule. */
export function unscopedStatements(file: string, source: string, tables: readonly string[] = USER_TABLES): Hit[] {
  if (tables.length === 0) return [];
  const tableRe = new RegExp(`\\b(?:from|into|update|join)\\s+(${tables.join("|")})\\b`, "gi");
  const hits: Hit[] = [];
  for (const [literal] of source.matchAll(LITERAL_RE)) {
    const named = [...new Set([...literal.matchAll(tableRe)].map((m) => m[1].toLowerCase()))];
    if (named.length === 0) continue;
    const body = literal.slice(1).trimStart();
    const keyword = /^(select|update|delete|insert\s+into)\b/i.exec(body)?.[1].toLowerCase().replace(/\s+/g, " ");
    let why: string | null = null;
    if (keyword === "insert into") {
      if (!/\buser_id\b/.test(literal)) why = "insert without a user_id column";
    } else if (keyword === "select" || keyword === "update" || keyword === "delete") {
      const whereAt = literal.search(/\bwhere\b/i);
      const afterWhere = whereAt === -1 ? "" : literal.slice(whereAt);
      if (!OWNER_PREDICATE_RE.test(afterWhere)) why = `${keyword} without an owner predicate (user_id = $n) after where`;
    } else if (!/\buser_id\b/.test(literal)) {
      why = "statement without user_id";
    }
    if (!why) continue;
    for (const table of named) hits.push({ file, table, literal: literal.replace(/\s+/g, " "), why });
  }
  return hits;
}

test("USER_TABLES is derived from the DDL and holds the six original per-user tables", () => {
  for (const table of ["applications", "user_roles", "application_events", "outreach", "feedback", "role_corrections"]) {
    assert.ok(USER_TABLES.includes(table), `${table} missing from ${JSON.stringify(USER_TABLES)}`);
  }
  assert.ok(!USER_TABLES.includes("roles") && !USER_TABLES.includes("companies"), "shared tables are not per-user tables");
});

test("the scanner flags unscoped statements and passes scoped ones (self-check)", () => {
  const T = ["applications", "user_roles"];
  const flagged = (src: string) => unscopedStatements("x.ts", src, T).length;
  assert.equal(flagged('q("select * from applications where id = $1")'), 1);
  assert.equal(flagged('q("select * from applications where id = $1 and user_id = $2")'), 0);
  assert.equal(flagged("q(`insert into user_roles (user_id, role_id)\n values ($1, $2)`)"), 0);
  assert.equal(flagged('q("insert into user_roles (role_id) values ($1)")'), 1);
  assert.equal(flagged('q("select * from roles where id = $1")'), 0, "shared tables are not user tables");
  // A mention is not scoping.
  assert.equal(flagged('q("select user_id from applications")'), 1, "selecting the column is not an owner predicate");
  assert.equal(flagged('q("select * from applications where user_id is not null")'), 1, "is not null is not an owner predicate");
  assert.equal(flagged('q("update applications set user_id = $1 where id = $2")'), 1, "an assignment before where is not a predicate");
  // Owner predicate shapes that count.
  assert.equal(flagged('q("select a.* from applications a join companies c on c.id = a.company_id where a.user_id = $1")'), 0);
  assert.equal(flagged('q("delete from applications where id = any($1::uuid[]) and user_id = $2")'), 0);
  assert.equal(flagged('q("select 1 from user_roles where user_id = any($1::uuid[])")'), 0);
});

test("every SQL statement on a per-user table in lib/, app/ and components/ carries an owner predicate, or is on the justified allowlist", () => {
  const files = SCAN_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));
  const hits = files.flatMap((path) => unscopedStatements(repoPath(path), readFileSync(path, "utf8")));
  assert.ok(files.length > 0);

  const unexplained = hits.filter(
    (hit) => !ALLOWLIST.some((a) => a.file === hit.file && a.table === hit.table && a.match.test(hit.literal)),
  );
  assert.deepEqual(
    unexplained.map((hit) => `${hit.file} [${hit.table}] ${hit.why}: ${hit.literal}`),
    [],
    "per-user table statements without an owner predicate (add the filter, or justify a service-tier allowlist entry)",
  );

  // Every allowlist entry must still match a real statement, so a stale entry
  // cannot quietly cover a future unscoped query.
  for (const entry of ALLOWLIST) {
    assert.ok(
      hits.some((hit) => hit.file === entry.file && hit.table === entry.table && entry.match.test(hit.literal)),
      `stale allowlist entry: ${entry.file} [${entry.table}] ${entry.reason}`,
    );
  }
});
