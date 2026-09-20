// Agent timing table (MISSION C4). Run from the worktree root:
//   node --experimental-strip-types --env-file=../scout/.env.local scripts/profile-smoke.ts
//     [--n 3] [--thinking off|on|minimal|low] [--parse-model gemini-3.8-flash] [--legs transcript,roadmap.plan]
//
// What it measures: every Gemini leg of the profile stream, through the real
// harness (lib/agents/harness.ts: temperature 0, seed, schema, named timeout)
// with REAL inputs read read-only from Lakebase / Vector Search / Delta:
//   transcript          extractCourses on the stored profile's course list as TYPED TEXT (MODEL_PARSE)
//   match.target        the goal against the 3 nearest archetypes (MODEL_AGENT)
//   match.requirements  one 10-posting requirements batch from the open feed (MODEL_AGENT)
//   roadmap.certs       grounded certification search (MODEL_AGENT + googleSearch)
//   roadmap.plan        the semester plan over 200 real course candidates (MODEL_AGENT)
// What it cannot measure: the PDF parse itself. datasets/private/ holds no PDF
// (2026-09-19), so the transcript/resume legs are reported as UNMEASURED for
// PDFs; the typed-text transcript number is the model's latency on the same
// prompt, not on a PDF. The full runProfileAgent/runMatchAgent/runRoadmapAgent
// path only runs inside Next (their deferred lib imports are extensionless,
// which plain node cannot resolve), so it is not driven here; nothing is written.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

// ponytail: variable specifiers keep tsc (moduleResolution bundler, no
// allowImportingTsExtensions) from rejecting the ".ts" that plain node needs.
const load = <T>(p: string) => import(p) as Promise<T>;
const harness = await load<typeof import("../lib/agents/harness")>("../lib/agents/harness.ts");
const profile = await load<typeof import("../lib/agents/profile")>("../lib/agents/profile.ts");
const match = await load<typeof import("../lib/agents/match")>("../lib/agents/match.ts");
const roadmap = await load<typeof import("../lib/agents/roadmap")>("../lib/agents/roadmap.ts");
const postingTasks = await load<typeof import("../lib/posting-tasks")>("../lib/posting-tasks.ts");
const vectorSearch = await load<typeof import("../lib/vector-search")>("../lib/vector-search.ts");
const catalog = await load<typeof import("../lib/catalog")>("../lib/catalog.ts");
const { GoogleGenAI, ThinkingLevel } = await import("@google/genai");

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const N = Number(flag("n") ?? 3);
const PARSE_MODEL = flag("parse-model") ?? "gemini-3.8-flash";
const AGENT_MODEL = "gemini-3.8-flash";
const thinkingFlag = flag("thinking");
const thinking =
  thinkingFlag === "off"
    ? { thinkingBudget: 0 }
    : thinkingFlag === "on"
      ? { thinkingBudget: -1 }
    : thinkingFlag === "minimal"
      ? { thinkingLevel: ThinkingLevel.MINIMAL }
      : thinkingFlag === "low"
        ? { thinkingLevel: ThinkingLevel.LOW }
        : undefined;
const BAR_MS = 10_000;
const LEGS = flag("legs")?.split(",");

const pdfDir = join(import.meta.dirname, "..", "..", "datasets", "private");
const pdfs = readdirSync(pdfDir, { withFileTypes: true }).filter((f) => f.isFile() && /\.pdf$/i.test(f.name)).map((f) => f.name);
console.log(pdfs.length > 0 ? `PDFs on disk: ${pdfs.join(", ")} (not driven here; see header)` : `UNMEASURED: no PDF in ${pdfDir}`);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
const client = new GoogleGenAI({ apiKey });
const call: import("../lib/agents/harness").ModelCaller = (input) =>
  harness.callModel(thinking ? { ...input, thinking } : input, (params) => client.models.generateContent(params));

// --- real inputs, read-only ---------------------------------------------------
const db = new pg.Client({ connectionString: process.env.LAKEBASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const profileRows = await db.query<{ user_id: string; profile: import("../lib/agents/profile").ProfileOutput }>(
  "select user_id, profile from profiles order by updated_at desc limit 1",
);
if (profileRows.rows.length === 0) throw new Error("No profile row in Lakebase to measure against");
const stored = profileRows.rows[0].profile;
const postings = await db.query<{ role_id: string; title: string; jd: string | null }>(
  "select id as role_id, title, jd_snapshot as jd from roles where lifecycle = 'open' and jd_snapshot is not null order by created_at desc limit 10",
);
await db.end();
console.log(`profile ${profileRows.rows[0].user_id}: ${stored.courses.length} courses, ${stored.skills.length} skills; ${postings.rows.length} postings`);

const typedCourses = stored.courses.map((c) => `${c.code} ${c.title}${c.grade ? ` ${c.grade}` : ""}`).join("\n");
const goalText = `Goal: ${stored.goal}\nMajor: ${stored.major}\nSkills: ${stored.skills.join(", ")}`;
const candidateRows = await vectorSearch.queryIndex({
  name: "scout.core.archetypes_index",
  text: goalText,
  columns: ["id", "name", "definition"],
  numResults: 3,
});
const candidates = candidateRows
  .filter((row): row is { id: string; name: string; definition: string } => typeof row.name === "string")
  .map((row) => ({ name: row.name, definition: String(row.definition ?? "") }));
const keywords = Array.from(new Set([stored.major, ...stored.skills, ...stored.goal.split(/\s+/)].map((k) => k.trim()).filter((k) => k.length > 2)));
const courses = await catalog.loadCourseCandidates({ keywords, limit: 200 });
console.log(`${candidates.length} archetype candidates, ${courses.length} course candidates\n`);

// --- legs ---------------------------------------------------------------------
const legs: Record<string, () => Promise<unknown>> = {
  transcript: () => profile.extractCourses(call, PARSE_MODEL, undefined, typedCourses),
  "match.target": () => match.decideTargetArchetype(call, AGENT_MODEL, goalText, candidates),
  "match.requirements": () =>
    match.extractRequirements(
      call,
      AGENT_MODEL,
      postings.rows.map((p) => ({ roleId: p.role_id, title: p.title, jd: p.jd })),
      postingTasks.frameJobTextAsData,
      0,
    ),
  "roadmap.certs": () => roadmap.findCertifications(call, AGENT_MODEL, stored.goal, stored.major),
  "roadmap.plan": () =>
    roadmap.planSemesters(call, AGENT_MODEL, {
      profile: stored,
      targetSemesters: ["Spring 2027", "Summer 2027"],
      courses,
      clubs: [],
      certs: [],
    }),
};

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const table: Array<{ leg: string; n: number; p50: number; p95: number; note: string }> = [];
for (const [leg, run] of Object.entries(legs)) {
  if (LEGS && !LEGS.includes(leg)) continue;
  const samples: number[] = [];
  let note = "";
  for (let i = 0; i < N; i += 1) {
    const started = Date.now();
    try {
      const out = await run();
      samples.push(Date.now() - started);
      if (i === 0) note = Array.isArray(out) ? `${out.length} items` : typeof out === "string" ? `${out.split("\n").length} lines` : JSON.stringify(out).slice(0, 60);
    } catch (error) {
      note = (error as Error).message.slice(0, 300);
      break;
    }
  }
  const sorted = [...samples].sort((a, b) => a - b);
  table.push({ leg, n: samples.length, p50: sorted.length ? percentile(sorted, 50) : NaN, p95: sorted.length ? percentile(sorted, 95) : NaN, note });
}

console.log(`\nmodel policy: parse=${PARSE_MODEL} agent=${AGENT_MODEL} thinking=${thinkingFlag ?? "as coded in the agents"} n=${N} (p95 = max at n<20)`);
console.log("| leg | n | p50 ms | p95 ms | bar 10 s | note |");
console.log("|---|---|---|---|---|---|");
for (const row of table) {
  const verdict = Number.isNaN(row.p95) ? "FAIL" : row.p95 <= BAR_MS ? "pass" : "over";
  console.log(`| ${row.leg} | ${row.n} | ${row.p50} | ${row.p95} | ${verdict} | ${row.note} |`);
}
console.log("transcript/resume on a PDF: UNMEASURED (no PDF on disk); profile step = max(transcript, resume) since both parse in parallel.");
console.log("roadmap step = roadmap.certs + roadmap.plan (serial: the plan consumes the certs).");
