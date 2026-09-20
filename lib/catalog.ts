import type { QueryFn } from "./db";

// Catalog reads for the Roadmap agent and the add-node typeahead, from the
// Lakebase copies of vt_courses / vt_clubs (db/lakebase/007-catalog.sql,
// loaded by scripts/load-lakebase-catalog.mjs -- D-S4). Parameterized SQL,
// `ilike` over the pg_trgm GIN indexes. Every read still checks the table has
// rows before trusting it: a missing or still-empty table is a loud, named
// error (CONTEXT 13:25 "datasets arrive later"; MISSION invariant 0), never a
// silent empty roadmap. The Delta copies stay for Vector Search / Genie.
//
// ponytail: "./db" is reached only through the optional `q` param (default: a
// deferred `await import("./db")`), the same dependency-injection shape
// lib/student-profile.ts uses -- a static extensionless VALUE import between
// two lib/*.ts files breaks node --experimental-strip-types --test the moment
// a test imports this file. `import type` above is erased at runtime.
async function realQuery(): Promise<QueryFn> {
  return (await import("./db")).query;
}

export interface CourseCandidate {
  code: string;
  title: string;
  description: string;
  credits: number;
  department: string;
  level: number;
  prereqs: string | null;
}

export interface ClubCandidate {
  name: string;
  description: string;
  category: string;
  url: string;
}

// Exact wording from CONTEXT.md Locked 2026-09-19 13:25 and rule 2 of the
// L3b brief; tests/catalog-sql.test.ts pins these strings.
const NOT_LOADED = {
  courses:
    "Course catalog not loaded: expected datasets/vt_courses.csv with columns code, title, description, credits, department, level, prereqs",
  clubs: "Club catalog not loaded: expected datasets/vt_clubs.csv with columns name, description, category, url",
} as const;
const TABLE: Record<keyof typeof NOT_LOADED, string> = { courses: "vt_courses", clubs: "vt_clubs" };

// count(*) once per process per query function (production passes the one
// lib/db.ts `query`; a test's pglite-backed q gets its own entry). Only a
// non-empty result is remembered -- a failure re-checks on the next call.
const loaded = new WeakMap<QueryFn, Set<string>>();

async function assertLoaded(q: QueryFn, kind: keyof typeof NOT_LOADED): Promise<void> {
  const table = TABLE[kind];
  const seen = loaded.get(q) ?? new Set<string>();
  if (seen.has(table)) return;
  let count: number;
  try {
    const rows = await q<{ n: number }>(`select count(*)::int as n from ${table}`, [], table);
    count = Number(rows[0]?.n ?? 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("DATABASE_NOT_CONFIGURED")) throw error; // env misconfig: never masked
    throw new Error(NOT_LOADED[kind], { cause: error }); // table missing / migration 007 not applied
  }
  if (count === 0) throw new Error(NOT_LOADED[kind]);
  seen.add(table);
  loaded.set(q, seen);
}

const patterns = (keywords: readonly string[]) => keywords.map((k) => `%${k}%`);

export async function loadCourseCandidates(opts: {
  departments?: readonly string[];
  keywords?: readonly string[];
  limit: number;
  q?: QueryFn;
}): Promise<CourseCandidate[]> {
  const q = opts.q ?? (await realQuery());
  await assertLoaded(q, "courses");
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.departments && opts.departments.length > 0) {
    params.push(opts.departments);
    clauses.push(`department = any($${params.length}::text[])`);
  }
  if (opts.keywords && opts.keywords.length > 0) {
    params.push(patterns(opts.keywords));
    clauses.push(`(title ilike any($${params.length}::text[]) or description ilike any($${params.length}::text[]))`);
  }
  params.push(Math.trunc(opts.limit));
  const where = clauses.length > 0 ? `where ${clauses.join(" or ")}` : "";
  const rows = await q<{ code: string; title: string; description: string; credits: string | null; department: string | null; level: number | null; prereqs: string | null }>(
    `select code, title, description, credits, department, level, prereqs from vt_courses ${where} order by code limit $${params.length}`,
    params,
    "vt_courses",
  );
  return rows.map((r) => ({
    code: r.code,
    title: r.title,
    description: r.description,
    credits: Number(r.credits ?? 0),
    department: r.department ?? "",
    level: Number(r.level ?? 0),
    prereqs: r.prereqs,
  }));
}

export async function loadClubCandidates(opts: {
  categories?: readonly string[];
  keywords?: readonly string[];
  limit: number;
  q?: QueryFn;
}): Promise<ClubCandidate[]> {
  const q = opts.q ?? (await realQuery());
  await assertLoaded(q, "clubs");
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.categories && opts.categories.length > 0) {
    params.push(opts.categories);
    clauses.push(`category = any($${params.length}::text[])`);
  }
  if (opts.keywords && opts.keywords.length > 0) {
    params.push(patterns(opts.keywords));
    clauses.push(`(name ilike any($${params.length}::text[]) or description ilike any($${params.length}::text[]))`);
  }
  params.push(Math.trunc(opts.limit));
  const where = clauses.length > 0 ? `where ${clauses.join(" or ")}` : "";
  const rows = await q<{ name: string; description: string; category: string | null; url: string | null }>(
    `select name, description, category, url from vt_clubs ${where} order by name limit $${params.length}`,
    params,
    "vt_clubs",
  );
  return rows.map((r) => ({ name: r.name, description: r.description, category: r.category ?? "", url: r.url ?? "" }));
}

export async function courseCodesExist(codes: readonly string[], q?: QueryFn): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const run = q ?? (await realQuery());
  await assertLoaded(run, "courses");
  const rows = await run<{ code: string }>("select code from vt_courses where code = any($1::text[])", [codes], "vt_courses");
  return new Set(rows.map((r) => r.code));
}

export async function clubNamesExist(names: readonly string[], q?: QueryFn): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const run = q ?? (await realQuery());
  await assertLoaded(run, "clubs");
  const rows = await run<{ name: string }>("select name from vt_clubs where name = any($1::text[])", [names], "vt_clubs");
  return new Set(rows.map((r) => r.name));
}

export type CatalogSearch = {
  courses: Array<{ code: string; title: string }>;
  clubs: Array<{ name: string; description: string }>;
};

/** The add-node typeahead: courses (code or title) and clubs (name or description) in ONE round trip, `limit` of each. */
export async function searchCatalog(keyword: string, limit: number, q?: QueryFn): Promise<CatalogSearch> {
  const run = q ?? (await realQuery());
  const rows = await run<{ kind: "course" | "club"; a: string; b: string }>(
    `(select 'course' as kind, code as a, title as b from vt_courses where code ilike $1 or title ilike $1 order by code limit $2)
     union all
     (select 'club' as kind, name as a, description as b from vt_clubs where name ilike $1 or description ilike $1 order by name limit $2)`,
    [`%${keyword}%`, Math.trunc(limit)],
    "vt_courses",
  );
  return {
    courses: rows.filter((r) => r.kind === "course").map((r) => ({ code: r.a, title: r.b })),
    clubs: rows.filter((r) => r.kind === "club").map((r) => ({ name: r.a, description: r.b })),
  };
}
