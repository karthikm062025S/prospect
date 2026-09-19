import type { QueryFn } from "./db";

// The applications-side twin of lib/role-jd.ts ensureRoleJd, minus the capture:
// an application's snapshot is written at apply time (copied from the role) or
// by recaptureJdAction, so reading it is the whole job. It lives here rather
// than inside the server action so a test can drive it against the pglite
// test database — app/application-actions.ts pulls in next/headers and the
// `@/lib/*` aliases, neither of which `node --experimental-strip-types`
// resolves. Type-only imports are stripped, so this file stays test-loadable.
export type ApplicationJd = { html: string | null; captured_at: string | null };

export async function fetchApplicationJd(q: QueryFn, uid: string, applicationId: string): Promise<ApplicationJd> {
  const [row] = await q<{ jd_snapshot: string | null; jd_snapshot_at: string | null }>(
    "select jd_snapshot, jd_snapshot_at from applications where id = $1 and user_id = $2",
    [applicationId, uid],
    "applications",
  );
  // A missing row is "nothing captured" — the pane renders its "No posting
  // text captured" state with the Capture button, which is the right next
  // move. A failed read throws (named) like every other query.
  if (!row) return { html: null, captured_at: null };
  return { html: row.jd_snapshot ?? null, captured_at: row.jd_snapshot_at ?? null };
}
