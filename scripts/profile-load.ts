// Runs the Profile agent for a REAL user id from PDFs on disk -- the same code
// path app/api/profile/route.ts runs for an upload, minus the browser.
// Run from scout/:
//   node --experimental-strip-types --env-file=.env.local scripts/profile-load.ts \
//     --user <uuid> --resume <path.pdf> --transcript <path.pdf> --major "..." \
//     --goal "..." --season Summer --year 2027 [--roleTypes internship,co-op] \
//     [--dreamTier "Big 4",startups] [--gradTerm "Spring 2028"] [--workAuth "F-1 (CPT/OPT)"]
import { readFileSync } from "node:fs";
import { runProfileAgent } from "../lib/agents/profile";

const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args.set(argv[i].replace(/^--/, ""), argv[i + 1] ?? "");
function need(name: string): string {
  const v = args.get(name);
  if (!v) throw new Error(`--${name} is required`);
  return v;
}
const list = (name: string, fallback: string) => (args.get(name) ?? fallback).split(",").map((s) => s.trim()).filter(Boolean);

const profile = await runProfileAgent(
  {
    userId: need("user"),
    resumePdf: new Uint8Array(readFileSync(need("resume"))),
    transcriptPdf: new Uint8Array(readFileSync(need("transcript"))),
    form: {
      major: need("major"),
      gradTerm: args.get("gradTerm") ?? "Spring 2028",
      workAuthorization: args.get("workAuth") ?? "F-1 (CPT/OPT)",
      roleTypes: list("roleTypes", "internship") as never,
      targetTerm: { season: need("season"), year: Number(need("year")) },
      goal: need("goal"),
      dreamTier: list("dreamTier", "Big 4") as never,
    },
  },
  (step) => console.log(`[${step.step}] ${step.label} (count=${step.count})`),
);
console.log(`profile stored: major=${profile.major} courses=${profile.courses.length} skills=${profile.skills.length}`);
