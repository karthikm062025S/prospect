import type { VisaClass } from "./types";
import type { GateResult } from "./gate-rules";

// Task 3 L3: the rules-only sweep behind POST
// /api/gate-sweep, the shape of lib/classify.ts's runSweep minus the model.
// Residue = rows with a JD and no `gate_checked_at`, oldest first. Every
// processed row gets the stamp whether or not a flag was written, so the sweep
// is idempotent; a stored `visa_class` is never overwritten (a hand-set or
// earlier value wins). $0: no model, no kill switch. No static lib-to-lib VALUE
// import here on purpose (the strip-types runner cannot follow one,
// the module-resolution rule): the rules and the clock arrive in `deps` and
// app/api/gate-sweep/route.ts wires the real ones.

export type GateRow = { id: string; jd_snapshot: string; visa_class: string | null };

export type Db = {
  residue(limit: number): Promise<GateRow[]>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  remaining(): Promise<number>;
};

export type Deps = { gate: (html: string) => GateResult; now?: () => Date };
export type SweepOpts = { limit: number; dryRun: boolean };
export type SweepRow = { id: string; visa_class: VisaClass | null; note: string | null; skipped: boolean };
export type SweepResult = { dry_run: boolean; processed: number; flagged: number; remaining: number; rows: SweepRow[] };

const LIMIT_DEFAULT = 50;
const LIMIT_MAX = 200;

export function parseParams(url: URL): SweepOpts {
  const dryRun = url.searchParams.get("dry_run") === "1";
  const raw = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(raw) ? Math.min(LIMIT_MAX, Math.max(1, raw)) : LIMIT_DEFAULT;
  return { limit, dryRun };
}

// The patch for one row: the stamp always; the flag only when the rules fired
// on a row nobody has labelled yet.
export function gatePatch(row: { visa_class: string | null }, result: GateResult, now: string): { patch: Record<string, unknown>; skipped: boolean } {
  const patch: Record<string, unknown> = { gate_checked_at: now };
  if (row.visa_class !== null) return { patch, skipped: true };
  if (result.visa_class) {
    patch.visa_class = result.visa_class;
    patch.eligibility_note = result.note;
  }
  return { patch, skipped: false };
}

export async function runGateSweep(opts: SweepOpts, db: Db, deps: Deps): Promise<SweepResult> {
  const rows = await db.residue(opts.limit);
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const out: SweepRow[] = [];
  for (const row of rows) {
    // Fold 2 A8: a JD that makes the rules throw is stamped and skipped, never
    // flagged and never left to block the oldest batch; abstaining is the contract.
    let result: GateResult = { visa_class: null, note: null, matched: null };
    let threw = false;
    try {
      result = deps.gate(row.jd_snapshot);
    } catch {
      threw = true;
    }
    const { patch, skipped } = threw ? { patch: { gate_checked_at: now }, skipped: true } : gatePatch(row, result, now);
    if (!opts.dryRun) await db.update(row.id, patch);
    out.push({ id: row.id, visa_class: skipped ? null : result.visa_class, note: skipped ? null : result.note, skipped });
  }
  return {
    dry_run: opts.dryRun,
    processed: out.length,
    flagged: out.filter((r) => r.visa_class !== null).length,
    remaining: await db.remaining(),
    rows: out,
  };
}

export type RequestCtx = {
  expected: string | undefined; // process.env.WATCHER_SECRET
  isCorrectPassword: (candidate: string, expected: string) => boolean;
  db: () => Db; // built only after the secret passes
  deps: Deps;
  log?: (entry: Record<string, unknown>) => void; // server-side only; the real failure message goes here, never to the caller
};

// The whole route minus Next: same bearer check as app/api/classify/route.ts.
export async function gateSweepRequest(request: Request, ctx: RequestCtx): Promise<{ status: number; body: unknown }> {
  const secret = request.headers.get("X-Watcher-Secret");
  if (!secret || !ctx.expected || !ctx.isCorrectPassword(secret, ctx.expected)) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  try {
    const result = await runGateSweep(parseParams(new URL(request.url)), ctx.db(), ctx.deps);
    return { status: 200, body: result };
  } catch (err) {
    ctx.log?.({ lane: "gate-sweep", status: 500, error: err instanceof Error ? err.message : String(err) });
    return { status: 500, body: { error: "sweep failed" } };
  }
}
