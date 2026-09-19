import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isCorrectPassword } from "@/lib/gate";
import { gateFromText } from "@/lib/gate-rules";
import { gateSweepRequest, type Db, type GateRow } from "@/lib/gate-sweep";

// Task 3 (MISSION T4, 2026-09-16): the rules-only sponsorship / citizenship /
// clearance sweep. .github/workflows/gate-sweep.yml curls this every 3 h with
// the watcher secret until `remaining` is 0; the first run over the backlog IS
// the backfill. All logic lives in lib/gate-sweep.ts (rules from
// lib/gate-rules.ts); this file only wires Next, the service client and the
// env. $0: no model call, no kill switch.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RESIDUE_COLUMNS = "id,jd_snapshot,visa_class";

// Residue: any row with a JD not yet checked, oldest first
// (db/migration-2026-09-task3-signals.sql, roles_gate_residue_idx).
function supabaseDb(): Db {
  const supabase = createServiceClient();
  const residue = () => supabase.from("roles").select(RESIDUE_COLUMNS).not("jd_snapshot", "is", null).is("gate_checked_at", null);
  return {
    async residue(limit) {
      const { data, error } = await residue().order("created_at", { ascending: true }).limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as GateRow[];
    },
    async update(id, patch) {
      const { error } = await supabase.from("roles").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async remaining() {
      const { count, error } = await supabase
        .from("roles")
        .select("id", { count: "exact", head: true })
        .not("jd_snapshot", "is", null)
        .is("gate_checked_at", null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  };
}

export async function POST(request: Request) {
  const { status, body } = await gateSweepRequest(request, {
    expected: process.env.WATCHER_SECRET,
    isCorrectPassword,
    db: supabaseDb,
    deps: { gate: gateFromText },
    // A 500 answers "sweep failed"; the real message lands here in the Vercel log only.
    log: (entry) => console.error(JSON.stringify(entry)),
  });
  if (status === 200) {
    const { rows, ...counters } = body as { rows: unknown[] } & Record<string, unknown>;
    console.log(JSON.stringify({ lane: "gate-sweep", ...counters, rows: rows.length }));
  } else if (status === 401) {
    console.log(JSON.stringify({ lane: "gate-sweep", status }));
  }
  return NextResponse.json(body, { status });
}
