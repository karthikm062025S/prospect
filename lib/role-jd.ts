import type { SupabaseClient } from "@supabase/supabase-js";
import type { Endpoint } from "./jd-snapshot";
import type { GateResult } from "./gate-rules";
import endpoints from "../scripts/endpoints.json" with { type: "json" };

// ensureRoleJd (D24, MISSION v5): the ONE function both the ingest lanes
// (app/api/watcher, app/api/scan — insert-time capture) and the Home detail
// pane's lazy-open action call to get a posting's sanitized HTML + location.
// Returns the stored snapshot untouched when present (unless `force`);
// otherwise captures it, stores `jd_snapshot`/`jd_snapshot_at`/`jd_error` (a
// failure stamps its attempt time onto `jd_error`, see STAMP below), and
// backfills `location` ONLY when the role doesn't already have one (never
// churns a value a prior capture/scan already set). Never throws.
//
// ponytail: a second concurrent call (e.g. two tabs opening the same
// never-captured role) just re-captures and re-writes — no lock. Acceptable:
// low-frequency path, both writes derive from the SAME source posting, so the
// last write is equivalent to the first.

type CaptureFn = (
  role: { id: string; link: string | null; source: string | null },
  company: { ats: string | null; endpoint: string | null; name?: string | null },
) => Promise<{ html: string | null; location: string | null; error: string | null }>;

// ponytail: DYNAMIC (not static) import of lib/jd-snapshot.ts — a static
// extensionless value import between two lib/*.ts files throws
// ERR_MODULE_NOT_FOUND the moment `node --experimental-strip-types --test`
// loads a test that imports THIS file directly (proven; a `.ts`-extension
// import fixes that but then breaks `tsc`/`next build`, TS5097 — see
// my_projects/CLAUDE.md's test/app module-resolution gotcha). A dynamic
// import is resolved lazily at CALL time instead of at module-load time;
// every case in tests/role-jd.test.ts injects `opts.capture`, so this branch
// is never reached under the test runner. Next's bundler (webpack/turbopack)
// handles a dynamic import of a sibling module normally — this is the same
// certified sanitizer path captureJobDescription uses, reused as-is.
async function defaultCapture(
  role: { id: string; link: string | null; source: string | null },
  company: { ats: string | null; endpoint: string | null; name?: string | null },
): Promise<{ html: string | null; location: string | null; error: string | null }> {
  const { captureJobDescription, captureJobPosting } = await import("./jd-snapshot");
  const eps = endpoints as Endpoint[];
  // ATS-first (has a JSON location); page-fetch fallback never has one.
  const posting = await captureJobPosting(role, company, { fetch, endpoints: eps });
  if (posting.html !== null) return posting;
  const snap = await captureJobDescription({ role, company }, { fetch, endpoints: eps });
  return { html: snap?.html ?? null, location: posting.location, error: snap ? null : posting.error ?? "capture failed" };
}

// Task 3 T4: the sponsorship / citizenship / clearance rules run over a
// captured posting (same dynamic-import reason as defaultCapture; the hook
// cases in tests/role-jd.test.ts inject `opts.gate`).
type GateFn = (html: string) => GateResult | Promise<GateResult>;
async function defaultGate(html: string): Promise<GateResult> {
  const { gateFromText } = await import("./gate-rules");
  return gateFromText(html);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// G1 M1: a STORED snapshot is re-fetched at most once a day, even with force.
const RECAPTURE_MS = 86_400_000;
// ...and a role whose capture FAILED is re-attempted at most once every 10
// minutes, and only when the caller explicitly forces it (the detail pane's
// "Retry capture" button). That ceiling is what keeps SR-004 closed - a
// signed-in user looping the ~1,276 role ids still cannot drive outbound
// fetches at employer pages - while letting a real user retry a transient
// timeout instead of staring at the same stored error forever.
const RETRY_MS = 600_000;

// The attempt time of a FAILED capture is stamped onto jd_error rather than
// written to jd_snapshot_at or a new column: jd_snapshot_at means "when the
// snapshot we are showing was captured" (components/role-detail-pane.tsx
// renders it as "captured <date>"), so an attempt time there would make a
// failure render as a success. Format: "<iso> <message>". A legacy unstamped
// error reads back with at === null, which counts as "a retry is allowed".
const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) /;

export function stampJdError(message: string | null, at: string): string {
  return `${at} ${message ?? "capture failed"}`;
}

export function readJdError(stored: string | null | undefined): { at: number | null; message: string | null } {
  if (!stored) return { at: null, message: null };
  const m = STAMP.exec(stored);
  if (!m) return { at: null, message: stored };
  return { at: Date.parse(m[1]), message: stored.slice(m[0].length) || null };
}

export type RoleJd = { html: string | null; captured_at: string | null; error: string | null; location: string | null };

export async function ensureRoleJd(
  supabase: SupabaseClient,
  roleId: string,
  opts?: { force?: boolean; capture?: CaptureFn; gate?: GateFn }, // `capture` and `gate` are test-only injection hooks (defaults = the real ATS/page capture path and lib/gate-rules.ts); production callers never pass them
): Promise<RoleJd> {
  try {
    const { data: role, error: roleErr } = await supabase
      .from("roles")
      .select("id, link, source, location, jd_snapshot, jd_snapshot_at, jd_error, company_id, visa_class")
      .eq("id", roleId)
      .maybeSingle();
    if (roleErr) return { html: null, captured_at: null, error: roleErr.message, location: null };
    if (!role) return { html: null, captured_at: null, error: "role not found", location: null };
    const failure = readJdError(role.jd_error);
    // `force` is honoured only past the ceiling for whatever is stored: a day
    // for a successful snapshot (G1 M1), 10 minutes for a recorded failure.
    // SR-004 (2026-09-03): a role whose capture already FAILED used to be
    // re-fetched on every call, so a signed-in user could loop over ~1,276 role
    // ids and drive two outbound fetches each at employer career pages.
    // Review fold (2026-09-03): that short-circuit made "Retry capture" a
    // permanent no-op - a failure left jd_snapshot_at null, so `fresh` was
    // false, and the stored error came back on every call forever. A failure
    // now carries its own attempt time, so an explicit retry gets through once
    // the 10-minute ceiling has passed.
    const fresh = role.jd_snapshot
      ? !!role.jd_snapshot_at && Date.now() - new Date(role.jd_snapshot_at).getTime() < RECAPTURE_MS
      : failure.at !== null && Date.now() - failure.at < RETRY_MS;
    if ((role.jd_snapshot || role.jd_error) && (!opts?.force || fresh)) {
      return { html: role.jd_snapshot, captured_at: role.jd_snapshot_at ?? null, error: failure.message, location: role.location ?? null };
    }

    const { data: company } = await supabase
      .from("companies")
      .select("name, ats, endpoint")
      .eq("id", role.company_id)
      .maybeSingle();

    const capture = opts?.capture ?? defaultCapture;
    const result = await capture(
      { id: role.id, link: role.link, source: role.source },
      { ats: company?.ats ?? null, endpoint: company?.endpoint ?? null, name: company?.name ?? null },
    );

    const now = new Date().toISOString();
    const failedWith = result.html ? null : result.error ?? "capture failed";
    const patch: Record<string, unknown> = {
      jd_snapshot: result.html,
      jd_snapshot_at: result.html ? now : null,
      // The attempt time rides on jd_error (see STAMP) so the next forced
      // retry knows how long ago the last one was.
      jd_error: failedWith === null ? null : stampJdError(failedWith, now),
    };
    let location: string | null = role.location ?? null;
    if (result.location && role.location == null) {
      patch.location = result.location;
      location = result.location;
    }
    // Task 3 T4: the gate rides in the same patch as the snapshot, only on a
    // successful capture and only when nobody has labelled the row yet (a
    // hand-set or earlier value wins). The stamp lands whether or not a flag
    // was written, so the sweep never re-reads this row.
    // ponytail: a gate failure never loses the capture; the row stays in the
    // sweep residue and the wiring is proven by `next build`.
    if (result.html && role.visa_class == null) {
      try {
        const gate = await (opts?.gate ?? defaultGate)(result.html);
        patch.gate_checked_at = now;
        if (gate.visa_class) {
          patch.visa_class = gate.visa_class;
          patch.eligibility_note = gate.note;
        }
      } catch {
        // abstain
      }
    }

    const { error: updateErr } = await supabase.from("roles").update(patch).eq("id", roleId);
    return {
      html: result.html,
      captured_at: (patch.jd_snapshot_at as string | null) ?? null,
      error: updateErr ? `store failed: ${updateErr.message}` : failedWith,
      location,
    };
  } catch (e) {
    return { html: null, captured_at: null, error: errMsg(e), location: null };
  }
}

// Ingest-time fan-out (MISSION v5 item 2): both /api/watcher and /api/scan call
// this from inside their after() for the roles they JUST inserted this
// request. ponytail: bounded to MAX_CONCURRENT in flight and MAX_PER_REQUEST
// total so a big ingest burst can't blow the after() function's time budget —
// any insert beyond the cap just keeps jd_snapshot null until the lazy
// on-first-open path (ensureRoleJd via the Home detail pane) fills it in.
const MAX_CONCURRENT = 5;
const MAX_PER_REQUEST = 40;

export async function captureInsertedRoleJds(
  supabase: SupabaseClient,
  roleIds: string[],
): Promise<{ captured: number; failed: number }> {
  const ids = roleIds.slice(0, MAX_PER_REQUEST);
  let captured = 0;
  let failed = 0;
  let i = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, ids.length) }, async () => {
    while (i < ids.length) {
      const id = ids[i++];
      const res = await ensureRoleJd(supabase, id);
      if (res.html) captured += 1;
      else failed += 1;
    }
  });
  await Promise.all(workers);
  return { captured, failed };
}
