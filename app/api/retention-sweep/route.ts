import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isCorrectPassword } from "@/lib/gate";
import { retentionSweepRequest, makeRetentionDb } from "@/lib/retention";

// D11 (MISSION.md, docs/plans/cron-mission-2026-09-24): the free-tier
// retention prune. .github/workflows/retention.yml curls this daily with the
// watcher secret. Dry run is the DEFAULT (any dry_run value other than an
// explicit "0" writes nothing); a real delete ALSO requires the Vercel env
// RETENTION_PRUNE_ENABLED === "1" (the kill switch, enforced server-side in
// lib/retention.ts's runRetentionSweep per handoff-R4.md's recommended
// mechanism). This route is the ONLY gate (fix round 1): the workflow does
// not read this var at all. All logic and SQL live in lib/retention.ts;
// this file only wires Next, the Lakebase pool and the env.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { status, body } = await retentionSweepRequest(request, {
    expected: process.env.WATCHER_SECRET,
    isCorrectPassword,
    pruneEnabled: process.env.RETENTION_PRUNE_ENABLED === "1",
    db: () => makeRetentionDb(query),
    // A 500 answers a generic error; the real message lands here in the Vercel log only.
    log: (entry) => console.error(JSON.stringify(entry)),
  });
  console.log(JSON.stringify({ lane: "retention-sweep", status, ...(status === 200 ? (body as Record<string, unknown>) : {}) }));
  return NextResponse.json(body, { status });
}
