import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isCorrectPassword } from "@/lib/gate";
import { upsertRole, toInsertedRoleEcho, type InsertedRoleEcho } from "@/lib/upsert-role";
import { captureInsertedRoleJds } from "@/lib/role-jd";
import { parseWatcherPayload } from "@/lib/watcher-payload";

export async function POST(request: Request) {
  const secret = request.headers.get("X-Watcher-Secret");
  const expected = process.env.WATCHER_SECRET;
  if (!secret || !expected || !isCorrectPassword(secret, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = parseWatcherPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = createServiceClient();
  let inserted = 0;
  let updated = 0;
  let skippedApplied = 0;
  let skippedTombstoned = 0;
  let skippedFiltered = 0;
  const roleErrors: string[] = [];
  const insertedRoles: InsertedRoleEcho[] = [];
  const insertedRoleIds: string[] = [];

  for (const entry of parsed.roles) {
    try {
      const { action, role } = await upsertRole(supabase, entry);
      if (action === "insert") {
        inserted += 1;
        insertedRoles.push(toInsertedRoleEcho(entry));
        if (role && typeof role === "object" && "id" in role) {
          insertedRoleIds.push((role as { id: string }).id);
        }
      } else if (action === "update") updated += 1;
      else if (action === "skip_tombstoned") skippedTombstoned += 1;
      else if (action === "skip_filtered") skippedFiltered += 1;
      else skippedApplied += 1;
    } catch (err) {
      if (roleErrors.length < 10) {
        roleErrors.push(err instanceof Error ? err.message : "role upsert failed");
      }
    }
  }

  if (insertedRoleIds.length > 0) {
    after(async () => {
      const { captured, failed } = await captureInsertedRoleJds(supabase, insertedRoleIds);
      console.log(JSON.stringify({ lane: "jd-ingest", inserted: insertedRoleIds.length, captured, failed }));
    });
  }

  return NextResponse.json({
    roles: {
      inserted,
      updated,
      skipped_applied: skippedApplied,
      skipped_tombstoned: skippedTombstoned,
      skipped_filtered: skippedFiltered,
      inserted_roles: insertedRoles,
      errors: roleErrors,
    },
  });
}
