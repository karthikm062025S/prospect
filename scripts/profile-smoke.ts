// Live proof for done-means E. Run from the worktree root:
//   node --experimental-strip-types --env-file=../scout/.env.local scripts/profile-smoke.ts
// Requires: real PDFs at ../datasets/private/*.pdf (a resume + a transcript, any names) AND
// GEMINI_API_KEY + LAKEBASE_URL in ../scout/.env.local. Writes a REAL row to Lakebase profiles/
// agent_runs under the fixed smoke-test user id below -- easy to find and delete afterward.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runProfileAgent } from "../lib/agents/profile";

const SMOKE_USER_ID = "00000000-0000-0000-0000-000000000001";
const DIR = join(import.meta.dirname, "..", "..", "datasets", "private");

function firstPdf(match: RegExp): Uint8Array | undefined {
  const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
  const found = files.find((f) => match.test(f)) ?? files[0];
  return found ? new Uint8Array(readFileSync(join(DIR, found))) : undefined;
}

const resumePdf = firstPdf(/resume/i);
const transcriptPdf = firstPdf(/transcript/i);

if (!resumePdf && !transcriptPdf) {
  console.error(`No PDFs found in ${DIR}`);
  process.exit(1);
}

const profile = await runProfileAgent(
  {
    userId: SMOKE_USER_ID,
    resumePdf,
    transcriptPdf,
    form: {
      major: "Computer Science",
      gradTerm: "Spring 2028",
      workAuthorization: "F-1 (CPT/OPT)",
      roleTypes: ["internship"],
      targetTerm: { season: "Summer", year: 2027 },
      goal: "Land a backend software engineering internship.",
      dreamTier: ["FAANG"],
    },
  },
  (step) => console.log(`[${step.step}] ${step.label} (count=${step.count})`),
);

console.log(JSON.stringify(profile, null, 2));
