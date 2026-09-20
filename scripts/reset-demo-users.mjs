// Wipes every NON-OWNER user account and all non-owner user-owned rows, then creates 5 fresh
// demo accounts with short emails / a short password, so the deployed app recognizes no
// previous account. The postings feed, the VT datasets, companies, endpoints, watcher state
// and the OWNER account all SURVIVE.
//
//   node scripts/reset-demo-users.mjs --dry-run    # baseline + plan, writes nothing, exit 0
//   node scripts/reset-demo-users.mjs --execute    # the destructive run (Karthik's gate)
//
// Env: LAKEBASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional
// OWNER_USER_ID. Read from the process env, else loaded from .env.local (stdlib
// process.loadEnvFile, no new deps). Service role only, server-side; never bundled, never in
// the app. Never prints a URL or a key.
//
// THE OWNER IS NEVER DELETED (binding, Karthik 2026-09-20). OWNER_USER_ID on Vercel points at
// the tech demo persona; the MCP server (app/api/[transport]/route.ts answers only as that user
// id) and the ANS/GoDaddy passport both depend on it existing. Resolution order:
//   (a) process.env.OWNER_USER_ID, which must match a real auth user, else
//   (b) the auth user whose email is tech@prospect-demo.com.
// Unresolvable = exit non-zero BEFORE any write, in both modes.
//
// USER-OWNED TABLES, IN DELETE ORDER (children before parents). Every delete carries the owner
// exclusion `user_id is distinct from $owner` -- `is distinct from`, not `<>`, so rows with a
// NULL user_id (anonymous feedback, unattributed agent runs) are deleted too instead of
// silently surviving a three-valued comparison:
//    1. application_events   user_id + application_id -> applications  (owner rule widened: a
//                            row also survives when its parent application is the owner's)
//    2. roadmap_nodes        user_id + roadmap_id -> roadmaps
//    3. roadmaps             user_id (unique, one per student)
//    4. match_scores         user_id + role_id
//    5. nudges               user_id + role_id
//    6. role_corrections     user_id + role_id  (per-user signal, NOT a shared role field)
//    7. user_roles           user_id + role_id  (save/hide/delete/apply state)
//    8. outreach             user_id
//    9. feedback             user_id (nullable) + email + ip_hash -- anonymous rows are still
//                            user submissions carrying PII, so every non-owner row goes
//   10. profiles             user_id (primary key)
//   11. agent_runs           user_id (nullable) -- per-user agent run history
//   12. applications         user_id; deleted last (8 and 1 point at it)
//
// NEVER TOUCHED (not user data -- the demo needs them alive):
//   roles, role_archetypes, role_tasks, archetypes, companies, tombstones, watch_state,
//   vt_courses, vt_clubs, task_exposure.
//   Read-only proof: their row counts are captured before and after and must be identical.
//
// TWO KNOWN, DELIBERATE RESIDUES ON `roles` (a shared table, so it is never deleted from):
//   * roles.application_id is nulled by its own FK (on delete set null, deferrable) when the
//     applications it points at go. That is the constraint doing its job, not a write by this
//     script -- the pointer would otherwise dangle at a deleted row.
//   * roles.saved_at / hidden_at / apply_clicked_at are legacy single-user columns from before
//     user_roles existed. They are left as they are: `roles_public` (the column allowlist the
//     signed-in app reads, db/lakebase/001-schema.sql) does not expose them, so no demo account
//     can see them. Reported at the end as residue, never written.
//
// Supabase holds AUTH ONLY for this app (db/lakebase/001-schema.sql D11, lib/db.ts): no
// PostgREST table reads and no storage buckets exist anywhere in lib/ or app/, so deleting the
// auth users is the whole of the Supabase-side wipe.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const OWNER_FALLBACK_EMAIL = "tech@prospect-demo.com";

// table -> the delete predicate that spares the owner. $1 is the owner user id.
const USER_TABLES = [
  [
    "application_events",
    `user_id is distinct from $1
       and (application_id is null
            or not exists (select 1 from applications a where a.id = application_id and a.user_id = $1))`,
  ],
  ["roadmap_nodes", "user_id is distinct from $1"],
  ["roadmaps", "user_id is distinct from $1"],
  ["match_scores", "user_id is distinct from $1"],
  ["nudges", "user_id is distinct from $1"],
  ["role_corrections", "user_id is distinct from $1"],
  ["user_roles", "user_id is distinct from $1"],
  ["outreach", "user_id is distinct from $1"],
  ["feedback", "user_id is distinct from $1"],
  ["profiles", "user_id is distinct from $1"],
  ["agent_runs", "user_id is distinct from $1"],
  ["applications", "user_id is distinct from $1"],
];
const USER_TABLE_NAMES = USER_TABLES.map(([t]) => t);

const PRESERVED_TABLES = [
  "archetypes",
  "companies",
  "role_archetypes",
  "role_tasks",
  "roles",
  "task_exposure",
  "tombstones",
  "vt_clubs",
  "vt_courses",
  "watch_state",
];

const DEMO_EMAILS = ["a1@p.test", "a2@p.test", "a3@p.test", "a4@p.test", "a5@p.test"];
const DEMO_PASSWORD = "pass1234";
const DEMO_METADATA = { demo: true, created: "2026-09-20" };
const EXPECTED_AUTH_AFTER = DEMO_EMAILS.length + 1; // the 5 new accounts + the owner

const mode = process.argv.includes("--execute")
  ? "execute"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;
if (!mode) {
  console.error("USAGE: node scripts/reset-demo-users.mjs --dry-run | --execute");
  process.exit(2);
}

const envFile = resolve(import.meta.dirname, "..", ".env.local");
if (!process.env.LAKEBASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

const lakebaseUrl = process.env.LAKEBASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const missing = [
  ["LAKEBASE_URL", lakebaseUrl],
  ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length > 0) {
  console.error(`NOT_CONFIGURED: ${missing.join(", ")} not set (looked in the env and ${envFile})`);
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const pool = new pg.Pool({ connectionString: lakebaseUrl, max: 1, connectionTimeoutMillis: 15_000 });

/** Every auth user, all pages. Fails loud with the Supabase message. */
async function listAllAuthUsers() {
  const all = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`AUTH_LIST_FAILED: ${error.message}`);
    all.push(...data.users);
    if (data.users.length < perPage) return all;
  }
}

/** OWNER_USER_ID if it names a real auth user, else the tech@prospect-demo.com user. Throws otherwise. */
function resolveOwner(users) {
  const configured = process.env.OWNER_USER_ID?.trim();
  if (configured) {
    const byId = users.find((u) => u.id === configured);
    if (!byId) {
      throw new Error(
        `OWNER_UNRESOLVED: OWNER_USER_ID=${configured} does not match any Supabase auth user. Refusing to write.`,
      );
    }
    return { user: byId, via: "OWNER_USER_ID" };
  }
  const byEmail = users.find((u) => u.email?.toLowerCase() === OWNER_FALLBACK_EMAIL);
  if (!byEmail) {
    throw new Error(
      `OWNER_UNRESOLVED: OWNER_USER_ID is unset and no auth user has the email ${OWNER_FALLBACK_EMAIL}. Refusing to write.`,
    );
  }
  return { user: byEmail, via: `email ${OWNER_FALLBACK_EMAIL}` };
}

/** { table: total } for the named tables, one statement each. */
async function countRows(tables) {
  const counts = {};
  for (const table of tables) {
    const { rows } = await pool.query(`select count(*)::int as n from "${table}"`);
    counts[table] = rows[0].n;
  }
  return counts;
}

/** { table: { total, owner, other } } for the user-owned tables, split by the delete predicate. */
async function countUserRows(ownerId) {
  const counts = {};
  for (const [table, predicate] of USER_TABLES) {
    const { rows } = await pool.query(
      `select count(*)::int as total, count(*) filter (where ${predicate})::int as other from "${table}"`,
      [ownerId],
    );
    counts[table] = { total: rows[0].total, other: rows[0].other, owner: rows[0].total - rows[0].other };
  }
  return counts;
}

/** Aborts if the live schema has a table this script has not classified as user-owned or preserved. */
async function assertSchemaKnown() {
  const { rows } = await pool.query(
    "select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE' order by 1",
  );
  const known = new Set([...USER_TABLE_NAMES, ...PRESERVED_TABLES]);
  const unknown = rows.map((r) => r.table_name).filter((t) => !known.has(t));
  if (unknown.length > 0) {
    throw new Error(
      `UNKNOWN_TABLE: ${unknown.join(", ")} exists in the database but is classified neither user-owned nor preserved. ` +
        "Classify it in scripts/reset-demo-users.mjs before running this again.",
    );
  }
  const live = new Set(rows.map((r) => r.table_name));
  const absent = [...known].filter((t) => !live.has(t));
  if (absent.length > 0) {
    throw new Error(`MISSING_TABLE: ${absent.join(", ")} is in the script's list but not in the database`);
  }
}

function printPreserved(label, counts) {
  console.log(label);
  for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(20)} ${n}`);
}

function printUserCounts(label, counts) {
  console.log(label);
  console.log(`  ${"table".padEnd(20)} ${"total".padStart(7)} ${"owner".padStart(7)} ${"other".padStart(7)}`);
  for (const [table, c] of Object.entries(counts)) {
    console.log(
      `  ${table.padEnd(20)} ${String(c.total).padStart(7)} ${String(c.owner).padStart(7)} ${String(c.other).padStart(7)}`,
    );
  }
}

let failed = false;
try {
  await assertSchemaKnown();

  // ---- BASELINE (printed in both modes) ----
  const usersBefore = await listAllAuthUsers();
  const { user: owner, via } = resolveOwner(usersBefore); // throws before any write
  const ownerId = owner.id;
  console.log(`MODE ${mode}`);
  console.log(`OWNER (never deleted, resolved via ${via}): ${owner.email ?? "(no email)"}  ${ownerId}`);

  console.log(`\nBASELINE auth users: ${usersBefore.length}`);
  for (const u of usersBefore) {
    console.log(`  ${u.id === ownerId ? "KEEP  " : "DELETE"} ${u.email ?? "(no email)"}  ${u.id}`);
  }
  const userCountsBefore = await countUserRows(ownerId);
  printUserCounts("\nBASELINE user-owned rows (delete order; 'other' is what gets deleted):", userCountsBefore);
  const preservedBefore = await countRows(PRESERVED_TABLES);
  printPreserved("\nBASELINE preserved rows (must not change):", preservedBefore);
  const { rows: residueBefore } = await pool.query(
    "select count(*) filter (where saved_at is not null)::int as saved, count(*) filter (where hidden_at is not null)::int as hidden, count(*) filter (where apply_clicked_at is not null)::int as clicked, count(*) filter (where application_id is not null)::int as app_ptr from roles",
  );
  console.log(
    `\nroles legacy single-user residue (never written by this script): saved_at=${residueBefore[0].saved} hidden_at=${residueBefore[0].hidden} apply_clicked_at=${residueBefore[0].clicked} application_id=${residueBefore[0].app_ptr}`,
  );

  // ---- PLAN ----
  const doomedUsers = usersBefore.filter((u) => u.id !== ownerId);
  console.log("\nPLAN");
  console.log(`  1. delete, in one transaction, sparing user_id = ${ownerId}, in this order:`);
  for (const [table, predicate] of USER_TABLES) {
    console.log(`       delete from ${table} where ${predicate.replace(/\s+/g, " ")};   -- ${userCountsBefore[table].other} rows`);
  }
  console.log(`  2. delete ${doomedUsers.length} Supabase auth users via the Admin API (the owner is skipped):`);
  for (const u of doomedUsers) console.log(`       ${u.email ?? "(no email)"}  ${u.id}`);
  console.log(`  3. create ${DEMO_EMAILS.length} accounts, email_confirm: true, metadata ${JSON.stringify(DEMO_METADATA)}`);
  for (const email of DEMO_EMAILS) console.log(`       ${email}  ${DEMO_PASSWORD}`);
  console.log(
    `  4. AFTER: auth users == ${EXPECTED_AUTH_AFTER} (owner + ${DEMO_EMAILS.length}), every user-owned table holds owner rows ONLY (other == 0), preserved tables unchanged`,
  );
  console.log(`  untouched: ${PRESERVED_TABLES.join(", ")}`);

  if (mode === "dry-run") {
    console.log("\nDRY RUN: nothing was written.");
  } else {
    // ---- 2. delete non-owner user-owned rows, one transaction ----
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const [table, predicate] of USER_TABLES) {
        const result = await client.query(`delete from "${table}" where ${predicate}`, [ownerId]);
        console.log(`\ndeleted ${result.rowCount} from ${table}`);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw new Error(`DELETE_FAILED (rolled back): ${error.message}`, { cause: error });
    } finally {
      client.release();
    }

    // ---- 3. delete every non-owner auth user ----
    for (const u of doomedUsers) {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) throw new Error(`AUTH_DELETE_FAILED ${u.email ?? u.id}: ${error.message}`);
    }
    console.log(`\ndeleted ${doomedUsers.length} auth users (owner ${ownerId} kept)`);

    // ---- 4. create the 5 demo accounts ----
    for (const email of DEMO_EMAILS) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: DEMO_METADATA,
      });
      if (error) throw new Error(`AUTH_CREATE_FAILED ${email}: ${error.message}`);
      console.log(`created ${email} ${data.user.id}`);
    }

    // ---- 5. AFTER counts ----
    const usersAfter = await listAllAuthUsers();
    const userCountsAfter = await countUserRows(ownerId);
    const preservedAfter = await countRows(PRESERVED_TABLES);
    console.log(`\nAFTER auth users: ${usersAfter.length}`);
    for (const u of usersAfter) console.log(`  ${u.email ?? "(no email)"}  ${u.id}`);
    printUserCounts("\nAFTER user-owned rows ('other' must be 0; 'owner' is what was spared):", userCountsAfter);
    printPreserved("\nAFTER preserved rows:", preservedAfter);

    // ---- 6. verdict ----
    if (usersAfter.length !== EXPECTED_AUTH_AFTER) {
      console.error(`VERIFY_FAILED: auth users = ${usersAfter.length}, expected ${EXPECTED_AUTH_AFTER}`);
      failed = true;
    }
    if (!usersAfter.some((u) => u.id === ownerId)) {
      console.error(`VERIFY_FAILED: the owner ${ownerId} is gone from auth`);
      failed = true;
    }
    const missingDemo = DEMO_EMAILS.filter((e) => !usersAfter.some((u) => u.email?.toLowerCase() === e));
    if (missingDemo.length > 0) {
      console.error(`VERIFY_FAILED: missing demo accounts: ${missingDemo.join(", ")}`);
      failed = true;
    }
    for (const [table, c] of Object.entries(userCountsAfter)) {
      if (c.other !== 0) {
        console.error(`VERIFY_FAILED: ${table} still has ${c.other} non-owner rows`);
        failed = true;
      }
      if (c.owner !== userCountsBefore[table].owner) {
        console.error(`VERIFY_FAILED: ${table} owner rows changed ${userCountsBefore[table].owner} -> ${c.owner}`);
        failed = true;
      }
    }
    for (const [table, n] of Object.entries(preservedAfter)) {
      if (n !== preservedBefore[table]) {
        console.error(`VERIFY_FAILED: preserved table ${table} changed ${preservedBefore[table]} -> ${n}`);
        failed = true;
      }
    }
    if (!failed) {
      console.log(
        `\nOK: owner kept, ${DEMO_EMAILS.length} demo accounts created, no non-owner rows left, every preserved table unchanged.`,
      );
      console.log("Sign in with:");
      for (const email of DEMO_EMAILS) console.log(`  ${email}  ${DEMO_PASSWORD}`);
    }
  }
} catch (error) {
  console.error(`RESET_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  failed = true;
} finally {
  await pool.end();
}

process.exit(failed ? 1 : 0);
