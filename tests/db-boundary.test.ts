import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

// the one Lakebase pool (lib/db.ts) is server-only. It
// must never be imported from client code (any file carrying "use client"),
// nor from the public landing (app/(public), app/welcome), which reads only the
// cached public-feed / public-stats readers. Successor of the Supabase-era
// tests/no-service-in-app.test.ts.
const ROOT = resolve(import.meta.dirname, "..");
const IMPORT_RE = /(?:from\s+|import\(\s*)["'](?:@\/lib\/db|(?:\.\.\/)+lib\/db|\.\/db)["']/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function repoPath(path: string): string {
  return relative(ROOT, path).split(sep).join("/");
}

const importers = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "lib")), ...sourceFiles(join(ROOT, "components"))]
  .map((path) => ({ path: repoPath(path), source: readFileSync(path, "utf8") }))
  .filter(({ source }) => IMPORT_RE.test(source));

test("lib/db.ts is imported somewhere (the scan is live, not vacuous)", () => {
  assert.ok(importers.length > 0, "no importer of lib/db found; the regex would pass an empty app");
});

test("no client component imports lib/db.ts", () => {
  const clientImporters = importers.filter(({ source }) => /^\s*["']use client["']/m.test(source)).map(({ path }) => path);
  assert.deepEqual(clientImporters, [], `client files importing lib/db: ${clientImporters.join(", ")}`);
});

test("the public landing never imports lib/db.ts directly", () => {
  const landing = importers
    .filter(({ path }) => path.startsWith("app/(public)/") || path.startsWith("app/welcome/"))
    .map(({ path }) => path);
  assert.deepEqual(landing, [], `landing files importing lib/db: ${landing.join(", ")}`);
});

test("lib/supabase is auth only: no table client survives the port", () => {
  const files = sourceFiles(join(ROOT, "lib", "supabase")).map(repoPath).sort();
  assert.deepEqual(files, ["lib/supabase/client.ts", "lib/supabase/cookie-options.ts", "lib/supabase/server.ts"]);
  for (const { path, source } of [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "lib")), ...sourceFiles(join(ROOT, "components"))].map((p) => ({ path: repoPath(p), source: readFileSync(p, "utf8") }))) {
    assert.doesNotMatch(source, /\.from\(\s*["']/, `${path} still uses a PostgREST table client`);
  }
});

// V1 ratified exception (L4 gate 2026-09-02) carried into Lakebase:
// lib/feedback-server.ts may hit the pool ONLY for the daily-cap counts and the
// insert-only feedback write. It must never grow a row-returning export.
test("lib/feedback-server.ts exports only the hash + count + insert helpers", () => {
  const source = readFileSync(join(ROOT, "lib", "feedback-server.ts"), "utf8");
  const exported = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(exported, ["countFeedbackToday", "countFeedbackTodayAll", "hashIp", "insertFeedback"]);
  // no row/PII-returning select: every select on feedback is a count(*)
  const selects = [...source.matchAll(/select\s+([^;`"]*?)\s+from\s+feedback/gi)].map((m) => m[1].trim());
  assert.ok(selects.length >= 3, `expected the three count reads, found ${selects.length}`);
  for (const columns of selects) assert.match(columns, /^count\(\*\)::int as n$/, `row-returning select on feedback: ${columns}`);
});
