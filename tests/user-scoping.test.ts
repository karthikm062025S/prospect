import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// D4 (build/MISSION.md): Supabase RLS scoped every per-user table to
// auth.uid(); Lakebase has one role, so the scoping is EXPLICIT in every
// statement. This static scan reads every SQL string literal under lib/ and
// app/ that names a per-user table and requires `user_id` inside the same
// literal. A statement that drops the filter leaks every user's rows, so a
// miss here is a failing test, not a warning.
const ROOT = resolve(import.meta.dirname, "..");
const USER_TABLES = ["user_roles", "applications", "outreach", "application_events", "role_corrections", "feedback"];
const TABLE_RE = new RegExp(`\\b(?:from|into|update|join)\\s+(${USER_TABLES.join("|")})\\b`, "gi");
// Every string literal: template literals (multi-line), double- and single-quoted.
const LITERAL_RE = /`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g;

// Service-tier exceptions: each is a statement that legitimately has no user
// in its WHERE. Keep this list short; every entry names its reason.
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

type Hit = { file: string; table: string; literal: string };

/** Every SQL literal naming a per-user table without `user_id` in it. */
export function unscopedStatements(file: string, source: string): Hit[] {
  const hits: Hit[] = [];
  for (const [literal] of source.matchAll(LITERAL_RE)) {
    const tables = [...literal.matchAll(TABLE_RE)].map((m) => m[1].toLowerCase());
    if (tables.length === 0 || /\buser_id\b/.test(literal)) continue;
    for (const table of new Set(tables)) hits.push({ file, table, literal: literal.replace(/\s+/g, " ") });
  }
  return hits;
}

test("the scanner flags an unscoped statement and passes a scoped one (self-check)", () => {
  assert.equal(unscopedStatements("x.ts", 'q("select * from applications where id = $1")').length, 1);
  assert.equal(unscopedStatements("x.ts", 'q("select * from applications where id = $1 and user_id = $2")').length, 0);
  assert.equal(unscopedStatements("x.ts", "q(`insert into user_roles (user_id, role_id)\n values ($1, $2)`)").length, 0);
  assert.equal(unscopedStatements("x.ts", 'q("select * from roles where id = $1")').length, 0, "shared tables are not user tables");
});

test("every SQL statement on a per-user table in lib/ and app/ carries user_id, or is on the justified allowlist", () => {
  const files = [...sourceFiles(join(ROOT, "lib")), ...sourceFiles(join(ROOT, "app"))];
  const hits = files.flatMap((path) => unscopedStatements(repoPath(path), readFileSync(path, "utf8")));
  assert.ok(files.length > 0);

  const unexplained = hits.filter(
    (hit) => !ALLOWLIST.some((a) => a.file === hit.file && a.table === hit.table && a.match.test(hit.literal)),
  );
  assert.deepEqual(
    unexplained.map((hit) => `${hit.file} [${hit.table}]: ${hit.literal}`),
    [],
    "per-user table statements without user_id (add the filter, or justify a service-tier allowlist entry)",
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
