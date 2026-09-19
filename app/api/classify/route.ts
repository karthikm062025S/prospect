import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isCorrectPassword } from "@/lib/gate";
import { deriveSeason } from "@/lib/season";
import { familySignals } from "@/lib/family";
import { decodeEntities } from "@/lib/decode-entities";
import { classifyRequest, type Db, type ResidueRow } from "@/lib/classify";

// Task 2 (MISSION D5, 2026-09-15): the residue sweep. .github/workflows/
// classify.yml curls this every 3 h with the watcher secret until `remaining`
// is 0; the first run over the backlog IS the backfill. All logic lives in
// lib/classify.ts (rules from lib/season.ts + lib/family.ts, no fourth copy);
// this file only wires Next, the service client and the env. The sweep runs
// inside the request (no after()): the caller reads the counters.
//
// Segment config: maxDuration is the native Next timeout knob (D5: 60 s);
// force-dynamic keeps the route off any static path.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RESIDUE_COLUMNS = "id,title,jd_snapshot,season,family,families";

// D6: open roles never classified, with a JD, oldest first. `ids=` (the D9
// eval) reads those rows regardless of lifecycle or a prior stamp so a dry run
// can re-propose after the backlog sweep.
function supabaseDb(): Db {
  const supabase = createServiceClient();
  return {
    async residue(limit, ids) {
      const base = supabase.from("roles").select(RESIDUE_COLUMNS).not("jd_snapshot", "is", null);
      const query = ids
        ? base.in("id", ids)
        : base.eq("lifecycle", "open").is("classified_at", null).order("created_at", { ascending: true });
      const { data, error } = await query.limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as ResidueRow[];
    },
    async update(id, patch) {
      const { error } = await supabase.from("roles").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async remaining() {
      const { count, error } = await supabase
        .from("roles")
        .select("id", { count: "exact", head: true })
        .eq("lifecycle", "open")
        .is("classified_at", null)
        .not("jd_snapshot", "is", null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  };
}

export async function POST(request: Request) {
  const { status, body } = await classifyRequest(request, {
    expected: process.env.WATCHER_SECRET,
    isCorrectPassword,
    db: supabaseDb,
    deps: {
      deriveSeason,
      familySignals,
      decodeEntities,
      fetch,
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL,
    },
    // A 500 answers "sweep failed"; the real message lands here in the Vercel log only.
    log: (entry) => console.error(JSON.stringify(entry)),
  });
  if (status === 200) {
    const { rows, ...counters } = body as { rows: unknown[] } & Record<string, unknown>;
    console.log(JSON.stringify({ lane: "classify", ...counters, rows: rows.length }));
  } else if (status === 401) {
    console.log(JSON.stringify({ lane: "classify", status }));
  }
  return NextResponse.json(body, { status });
}
