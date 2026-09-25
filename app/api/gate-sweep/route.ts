import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isCorrectPassword } from "@/lib/gate";
import { gateFromText } from "@/lib/gate-rules";
import { gateSweepRequest, type Db, type GateRow } from "@/lib/gate-sweep";

// Task 3: the rules-only sponsorship / citizenship /
// clearance sweep. .github/workflows/gate-sweep.yml curls this every 3 h with
// the watcher secret until `remaining` is 0; the first run over the backlog IS
// the backfill. All logic lives in lib/gate-sweep.ts (rules from
// lib/gate-rules.ts); this file only wires Next, the Lakebase pool and the
// env. $0: no model call, no kill switch.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RESIDUE_COLUMNS = "id, jd_snapshot, visa_class";

// Residue: any row with a JD not yet checked, oldest first
// (db/lakebase/001-schema.sql, roles_gate_residue_idx).
function lakebaseDb(): Db {
  return {
    async residue(limit) {
      return query<GateRow>(
        `select ${RESIDUE_COLUMNS} from roles where jd_snapshot is not null and gate_checked_at is null order by created_at asc limit $1`,
        [limit],
        "roles",
      );
    },
    async update(id, patch) {
      // Patch keys come from lib/gate-sweep.ts (visa_class/eligibility_note/gate_checked_at), never from a request.
      const keys = Object.keys(patch);
      await query(
        `update roles set ${keys.map((key, i) => `${key} = $${i + 2}`).join(", ")} where id = $1`,
        [id, ...keys.map((key) => patch[key])],
        "roles",
      );
    },
    async remaining() {
      const [row] = await query<{ n: number }>(
        "select count(*)::int as n from roles where jd_snapshot is not null and gate_checked_at is null",
        [],
        "roles",
      );
      return row.n;
    },
  };
}

export async function POST(request: Request) {
  const { status, body } = await gateSweepRequest(request, {
    expected: process.env.WATCHER_SECRET,
    isCorrectPassword,
    db: lakebaseDb,
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
