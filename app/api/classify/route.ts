import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isCorrectPassword } from "@/lib/gate";
import { deriveSeason } from "@/lib/season";
import { familySignals } from "@/lib/family";
import { decodeEntities } from "@/lib/decode-entities";
import { classifyRequest, type Db, type ResidueRow } from "@/lib/classify";

// Task 2 (MISSION D5, 2026-09-15): the residue sweep. .github/workflows/
// classify.yml curls this every 3 h with the watcher secret until `remaining`
// is 0; the first run over the backlog IS the backfill. All logic lives in
// lib/classify.ts (rules from lib/season.ts + lib/family.ts, no fourth copy);
// this file only wires Next, the Lakebase pool and the env. The sweep runs
// inside the request (no after()): the caller reads the counters.
//
// Segment config: maxDuration is the native Next timeout knob (D5: 60 s);
// force-dynamic keeps the route off any static path.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RESIDUE_COLUMNS = "id, title, jd_snapshot, season, family, families";

// D6: open roles never classified, with a JD, oldest first. `ids=` (the D9
// eval) reads those rows regardless of lifecycle or a prior stamp so a dry run
// can re-propose after the backlog sweep.
function lakebaseDb(): Db {
  return {
    async residue(limit, ids) {
      return ids
        ? query<ResidueRow>(
            `select ${RESIDUE_COLUMNS} from roles where jd_snapshot is not null and id = any($1::uuid[]) limit $2`,
            [ids, limit],
            "roles",
          )
        : query<ResidueRow>(
            `select ${RESIDUE_COLUMNS} from roles
              where jd_snapshot is not null and lifecycle = 'open' and classified_at is null
              order by created_at asc limit $1`,
            [limit],
            "roles",
          );
    },
    async update(id, patch) {
      // Patch keys come from lib/classify.ts (season/family/families/classified_*), never from a request.
      const keys = Object.keys(patch);
      await query(
        `update roles set ${keys.map((key, i) => `${key} = $${i + 2}`).join(", ")} where id = $1`,
        [id, ...keys.map((key) => patch[key])],
        "roles",
      );
    },
    async remaining() {
      const [row] = await query<{ n: number }>(
        "select count(*)::int as n from roles where lifecycle = 'open' and classified_at is null and jd_snapshot is not null",
        [],
        "roles",
      );
      return row.n;
    },
  };
}

export async function POST(request: Request) {
  const { status, body } = await classifyRequest(request, {
    expected: process.env.WATCHER_SECRET,
    isCorrectPassword,
    db: lakebaseDb,
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
