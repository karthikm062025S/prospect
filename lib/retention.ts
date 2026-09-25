import type { QueryFn } from "./db"; // type-only: erased under --experimental-strip-types, same pattern as tests/helpers/test-db.ts

// The free-tier retention prune. Deletes `roles` first seen (created_at) more
// than `days` ago AND not seen by any scanner in SEEN_DAYS (the old age-only
// predicate deleted still-live roles, which then re-inserted on the next
// scan as a "new" drop and re-emailed), EXCEPT any
// role a user acted on: a `user_roles` row, an `applications` row, a
// `role_corrections` row, an `outreach` row, or a non-null legacy
// single-owner column (application_id/saved_at/hidden_at/apply_clicked_at).
// Shape mirrors lib/gate-sweep.ts: a pure Db interface here, the real SQL in
// makeRetentionDb (shared by the route and by tests, which run it against
// the real schema via tests/helpers/test-db.ts's pglite instance).

export type RetentionDb = {
  /** Age-filtered, NOT acted-on: the count that WOULD be deleted and the oldest created_at in that set (null if empty). */
  wouldDelete(days: number): Promise<{ would_delete: number; oldest_created_at: string | null }>;
  /** Age-filtered AND acted-on (any signal): the count the prune must never touch. */
  excludedActedOn(days: number): Promise<number>;
  /** Deletes up to `limit` of the oldest matching (age-filtered, NOT acted-on) roles; returns the deleted ids. */
  deleteBatch(days: number, limit: number): Promise<string[]>;
};

export type RetentionOpts = { days: number; dryRun: boolean; pruneEnabled: boolean };

export type RetentionResult =
  | { dry_run: true; would_delete: number; excluded_acted_on: number; oldest_created_at: string | null; days: number }
  | { dry_run: false; deleted: number; excluded_acted_on: number; remaining: number };

const DAYS_DEFAULT = 45;
const DAYS_MIN = 30;
export const BATCH_SIZE = 500;
export const MAX_BATCHES = 10;
// D16: a role a scanner is still finding (last_seen_at, lib/upsert-role.ts's
// isStaleReFind - re-stamped on EVERY re-find, insert or repost) must never
// be pruned just because it is old. 14 days of scanner silence, not the
// 45-day age window, is what makes a role eligible for deletion.
export const SEEN_DAYS = 14;

// Dry run is the DEFAULT for this destructive route (unlike gate-sweep's
// dry_run=1-to-opt-in): only an explicit dry_run=0 asks for a real delete.
export function parseParams(url: URL): { days: number; dryRun: boolean } {
  const dryRun = url.searchParams.get("dry_run") !== "0";
  const raw = Number.parseInt(url.searchParams.get("days") ?? "", 10);
  const days = Number.isFinite(raw) ? Math.max(DAYS_MIN, raw) : DAYS_DEFAULT;
  return { days, dryRun };
}

// D3/D11: the kill switch
// (Vercel env RETENTION_PRUNE_ENABLED) is enforced HERE, server-side, not
// only by the caller's dry_run param - a caller with the watcher secret but
// no kill switch set can never trigger a real delete, matching "the route
// only executes the DELETE when both dry_run is not set AND the kill switch
// is on". The workflow no longer gates on this var at all (fix round 1):
// the route is the one and only gate.
export async function runRetentionSweep(opts: RetentionOpts, db: RetentionDb): Promise<RetentionResult> {
  const excluded = await db.excludedActedOn(opts.days);
  const dryRun = opts.dryRun || !opts.pruneEnabled;
  if (dryRun) {
    const { would_delete, oldest_created_at } = await db.wouldDelete(opts.days);
    return { dry_run: true, would_delete, excluded_acted_on: excluded, oldest_created_at, days: opts.days };
  }
  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const ids = await db.deleteBatch(opts.days, BATCH_SIZE);
    deleted += ids.length;
    if (ids.length < BATCH_SIZE) break; // nothing left to delete
  }
  const { would_delete: remaining } = await db.wouldDelete(opts.days);
  return { dry_run: false, deleted, excluded_acted_on: excluded, remaining };
}

// Acted-on = a user_roles row, an applications row, a role_corrections row,
// an outreach row (fix round 1, P1: db/lakebase/001-schema.sql:145 -
// outreach.role_id is a user action, tracked outside user_roles), or a
// non-null legacy single-owner column (db/lakebase/001-schema.sql). Never
// deleted, per D3/D11 and the CASCADE on user_roles.role_id and
// role_corrections.role_id.
const NOT_ACTED_ON = `
    not exists (select 1 from user_roles ur where ur.role_id = r.id)
    and not exists (select 1 from applications a where a.role_id = r.id)
    and not exists (select 1 from role_corrections rc where rc.role_id = r.id)
    and not exists (select 1 from outreach o where o.role_id = r.id)
    and r.application_id is null
    and r.saved_at is null
    and r.hidden_at is null
    and r.apply_clicked_at is null
`;
const ACTED_ON = `not (${NOT_ACTED_ON})`; // De Morgan: one predicate, never two hand-kept lists to drift apart

// D16: "last seen" falls back the same way isStaleReFind does (lib/upsert-role.ts) -
// a pre-migration row with no last_seen_at yet is judged by updated_at, then created_at,
// never treated as stale just because the column is null.
const NOT_SEEN_RECENTLY = `coalesce(r.last_seen_at, r.updated_at, r.created_at) < now() - interval '${SEEN_DAYS} days'`;

/** The real Lakebase queries, parameterized, built on the injected QueryFn (production `query`, or a test's pglite `q`). */
export function makeRetentionDb(q: QueryFn): RetentionDb {
  return {
    async wouldDelete(days) {
      const [row] = await q<{ would_delete: number; oldest_created_at: string | null }>(
        `select count(*)::int as would_delete, min(r.created_at) as oldest_created_at
         from roles r
         where r.created_at < now() - make_interval(days => $1::int)
           and ${NOT_SEEN_RECENTLY}
           and ${NOT_ACTED_ON}`,
        [days],
        "roles",
      );
      return row;
    },
    async excludedActedOn(days) {
      const [row] = await q<{ n: number }>(
        `select count(*)::int as n
         from roles r
         where r.created_at < now() - make_interval(days => $1::int)
           and (${ACTED_ON})`,
        [days],
        "roles",
      );
      return row.n;
    },
    async deleteBatch(days, limit) {
      const rows = await q<{ id: string }>(
        `with victims as (
           select r.id
           from roles r
           where r.created_at < now() - make_interval(days => $1::int)
             and ${NOT_SEEN_RECENTLY}
             and ${NOT_ACTED_ON}
           order by r.created_at asc
           limit $2
         )
         delete from roles where id in (select id from victims) returning id`,
        [days, limit],
        "roles",
      );
      return rows.map((r) => r.id);
    },
  };
}

export type RequestCtx = {
  expected: string | undefined; // process.env.WATCHER_SECRET
  isCorrectPassword: (candidate: string, expected: string) => boolean;
  pruneEnabled: boolean; // process.env.RETENTION_PRUNE_ENABLED === "1" (Vercel env); the kill switch, checked server-side (see runRetentionSweep)
  db: () => RetentionDb; // built only after the secret passes
  log?: (entry: Record<string, unknown>) => void; // server-side only; the real failure message goes here, never to the caller
};

// The whole route minus Next: same bearer check as app/api/gate-sweep/route.ts and app/api/watcher/route.ts.
export async function retentionSweepRequest(request: Request, ctx: RequestCtx): Promise<{ status: number; body: unknown }> {
  const secret = request.headers.get("X-Watcher-Secret");
  if (!secret || !ctx.expected || !ctx.isCorrectPassword(secret, ctx.expected)) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  try {
    const { days, dryRun } = parseParams(new URL(request.url));
    const result = await runRetentionSweep({ days, dryRun, pruneEnabled: ctx.pruneEnabled }, ctx.db());
    return { status: 200, body: result };
  } catch (err) {
    ctx.log?.({ lane: "retention-sweep", status: 500, error: err instanceof Error ? err.message : String(err) });
    return { status: 500, body: { error: "retention sweep failed" } };
  }
}
