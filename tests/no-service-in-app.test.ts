import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
// G3 (2026-09-03): also the sibling form `./supabase/service` used inside lib/.
const IMPORT_RE = /(?:from\s+|import\(\s*)["'](?:@\/lib\/supabase\/service|(?:\.\.\/)*lib\/supabase\/service|\.\/supabase\/service)["']/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function repoPath(path: string): string {
  return relative(ROOT, path).split(sep).join("/");
}

test("service-role imports stay inside the explicit server-only allowlist", () => {
  const importers = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "lib")), ...sourceFiles(join(ROOT, "components"))]
    .filter((path) => IMPORT_RE.test(readFileSync(path, "utf8")))
    .map(repoPath)
    .sort();

  const allowed = new Set([
    "app/api/[transport]/route.ts",
    // Task 2 D5: the classify sweep reads/writes the base roles table behind X-Watcher-Secret.
    "app/api/classify/route.ts",
    // Task 3 T4: the rules-only gate sweep stamps gate_checked_at / visa_class on base roles behind the same secret.
    "app/api/gate-sweep/route.ts",
    "app/api/scan/route.ts",
    "app/api/watcher/route.ts",
    "lib/application-delete-server.ts",
    "lib/feedback-server.ts",
    "lib/jd-capture-server.ts",
    // D19/L7b: cached reads of PUBLIC columns only for the landing (feed preview + coverage stats).
    "lib/public-feed.ts",
    "lib/public-stats.ts",
    "lib/upsert-role.ts",
  ]);
  const unexpected = importers.filter(
    (path) => !allowed.has(path) && !/^lib\/scan-[^/]+\.ts$/.test(path),
  );

  assert.deepEqual(unexpected, [], `unexpected service-role importer(s): ${unexpected.join(", ")}`);
});

test("public and signed-in UI/action paths never import the service client", () => {
  const forbidden = [...sourceFiles(join(ROOT, "app", "(app)")), ...sourceFiles(join(ROOT, "app", "welcome")), ...sourceFiles(join(ROOT, "app", "(public)"))]
    .concat(sourceFiles(join(ROOT, "app")).filter((path) => /(?:^|\/)[^/]+-actions\.tsx?$/.test(repoPath(path))))
    .concat(sourceFiles(join(ROOT, "components")))
    .filter((path) => IMPORT_RE.test(readFileSync(path, "utf8")))
    .map(repoPath)
    .sort();

  assert.deepEqual(forbidden, [], `forbidden service-role importer(s): ${forbidden.join(", ")}`);
});

// V1 ratified exception (L4 gate 2026-09-02): lib/feedback-server.ts may use the service client ONLY for the
// anonymous daily-cap count, and (SR-001, 2026-09-03) the insert-only feedback write.
// It must never grow a row-returning export.
test("lib/feedback-server.ts exports only the hash + count + insert helpers", () => {
  const source = readFileSync(join(ROOT, "lib", "feedback-server.ts"), "utf8");
  const exported = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]).sort();
  // G1 M2 (2026-09-03): a second HEAD count for the global daily ceiling; still no row-returning export.
  // SR-001 (2026-09-03): insertFeedback is the ONE write path; it returns { ok } only.
  assert.deepEqual(exported, ["countFeedbackToday", "countFeedbackTodayAll", "hashIp", "insertFeedback"]);
  assert.doesNotMatch(source, /\.select\(\s*["'][^"']*(?:\*|message|email)/, "no row/PII-returning select");
});
