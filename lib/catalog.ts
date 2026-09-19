// Delta reads (Unity Catalog scout.core.*) through the SQL warehouse, for the
// Roadmap agent. Same server-only boundary as lib/databricks-sql.ts. Every
// read checks the table actually has rows before trusting it -- a missing or
// still-empty table is a loud, named error (CONTEXT 13:25 "datasets arrive
// later"; MISSION invariant 0), never a silent empty roadmap. This module
// talks to Databricks over a single SQL string with no parameter binding
// (the Statement Execution API has none), so every literal is escaped with
// sqlEscape below -- never string-concatenated raw.
//
// ponytail: "./databricks-sql" is reached only through the optional `exec`
// param below (default: a deferred `await import(...)`), the same
// dependency-injection shape lib/student-profile.ts uses for `query`.
// Measured directly in this worktree: a STATIC top-level import of
// "./databricks-sql" throws ERR_MODULE_NOT_FOUND the moment a test imports
// this file under node --experimental-strip-types, and -- contrary to the
// header comment in lib/agents/profile.ts -- a bare DYNAMIC `await
// import("./databricks-sql")` throws the identical error the moment it is
// actually invoked under the same runner (profile.ts's own dynamic imports
// have never been exercised by a test, so that latent break was never
// caught there). Injecting `exec` sidesteps the whole problem: every test
// below passes a fake `exec`, so the real dynamic import is never reached.
export interface ExecuteResult {
  rows: unknown[][];
  columns: string[];
}
export type ExecuteFn = (sql: string) => Promise<ExecuteResult>;

async function realExecute(): Promise<ExecuteFn> {
  return (await import("./databricks-sql")).executeStatement;
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

const COURSES_TABLE = "scout.core.vt_courses";
const CLUBS_TABLE = "scout.core.vt_clubs";

// Exact wording from CONTEXT.md Locked 2026-09-19 13:25 and rule 2 of the
// L3b brief; tests/catalog-sql.test.ts pins these strings.
const NOT_LOADED = {
  courses:
    "Course catalog not loaded: expected datasets/vt_courses.csv with columns code, title, description, credits, department, level, prereqs",
  clubs: "Club catalog not loaded: expected datasets/vt_clubs.csv with columns name, description, category, url",
} as const;

// requiredEnv() in lib/databricks-sql.ts throws "<NAME> is not set" /
// "DATABRICKS_WAREHOUSE_PATH is malformed: ...". Those are env-configuration
// failures, never a missing-table condition, so they must pass through
// verbatim (rule 2: "Databricks env missing -> the named error ... shown
// verbatim") instead of being relabeled as "catalog not loaded".
const ENV_ERROR = /^(DATABRICKS_HOST|DATABRICKS_TOKEN|DATABRICKS_WAREHOUSE_PATH)( is not set| is malformed)/;

/** SQL-escapes a string literal for inline use in a Databricks statement (doubles single quotes). */
export function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

async function assertLoaded(exec: ExecuteFn, table: string, kind: keyof typeof NOT_LOADED): Promise<void> {
  let count: number;
  try {
    const { rows } = await exec(`select count(*) as n from ${table}`);
    count = Number(rows[0]?.[0] ?? 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (ENV_ERROR.test(message)) throw error; // env misconfig: never masked
    throw new Error(NOT_LOADED[kind], { cause: error }); // table missing / not created yet
  }
  if (count === 0) throw new Error(NOT_LOADED[kind]);
}

function likeClause(column: string, keywords: readonly string[]): string {
  return keywords.map((k) => `lower(${column}) like lower('%${sqlEscape(k)}%')`).join(" or ");
}

export async function loadCourseCandidates(opts: {
  departments?: readonly string[];
  keywords?: readonly string[];
  limit: number;
  exec?: ExecuteFn;
}): Promise<CourseCandidate[]> {
  const run = opts.exec ?? (await realExecute());
  await assertLoaded(run, COURSES_TABLE, "courses");
  const clauses: string[] = [];
  if (opts.departments && opts.departments.length > 0) {
    clauses.push(`department in (${opts.departments.map((d) => `'${sqlEscape(d)}'`).join(", ")})`);
  }
  if (opts.keywords && opts.keywords.length > 0) {
    clauses.push(`(${likeClause("title", opts.keywords)} or ${likeClause("description", opts.keywords)})`);
  }
  const where = clauses.length > 0 ? `where ${clauses.join(" or ")}` : "";
  const sql = `select code, title, description, credits, department, level, prereqs from ${COURSES_TABLE} ${where} limit ${Math.trunc(opts.limit)}`;
  const { rows } = await run(sql);
  return rows.map((r) => ({
    code: String(r[0]),
    title: String(r[1]),
    description: String(r[2]),
    credits: Number(r[3]),
    department: String(r[4]),
    level: Number(r[5]),
    prereqs: r[6] === null || r[6] === undefined ? null : String(r[6]),
  }));
}

export async function loadClubCandidates(opts: {
  categories?: readonly string[];
  keywords?: readonly string[];
  limit: number;
  exec?: ExecuteFn;
}): Promise<ClubCandidate[]> {
  const run = opts.exec ?? (await realExecute());
  await assertLoaded(run, CLUBS_TABLE, "clubs");
  const clauses: string[] = [];
  if (opts.categories && opts.categories.length > 0) {
    clauses.push(`category in (${opts.categories.map((c) => `'${sqlEscape(c)}'`).join(", ")})`);
  }
  if (opts.keywords && opts.keywords.length > 0) {
    clauses.push(`(${likeClause("name", opts.keywords)} or ${likeClause("description", opts.keywords)})`);
  }
  const where = clauses.length > 0 ? `where ${clauses.join(" or ")}` : "";
  const sql = `select name, description, category, url from ${CLUBS_TABLE} ${where} limit ${Math.trunc(opts.limit)}`;
  const { rows } = await run(sql);
  return rows.map((r) => ({
    name: String(r[0]),
    description: String(r[1]),
    category: String(r[2]),
    url: String(r[3]),
  }));
}

export async function courseCodesExist(codes: readonly string[], exec?: ExecuteFn): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const run = exec ?? (await realExecute());
  await assertLoaded(run, COURSES_TABLE, "courses");
  const list = codes.map((c) => `'${sqlEscape(c)}'`).join(", ");
  const { rows } = await run(`select code from ${COURSES_TABLE} where code in (${list})`);
  return new Set(rows.map((r) => String(r[0])));
}

export async function clubNamesExist(names: readonly string[], exec?: ExecuteFn): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const run = exec ?? (await realExecute());
  await assertLoaded(run, CLUBS_TABLE, "clubs");
  const list = names.map((n) => `'${sqlEscape(n)}'`).join(", ");
  const { rows } = await run(`select name from ${CLUBS_TABLE} where name in (${list})`);
  return new Set(rows.map((r) => String(r[0])));
}
