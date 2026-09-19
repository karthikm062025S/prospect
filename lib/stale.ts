// RB-026: quiet stale marker for applications sitting untouched in an
// active status. Injectable clock (nowMs pattern from lib/dashboard.ts).
export const STALE_DAYS = 21;

export function isStale(
  app: { status: string; status_changed_at: string | null },
  nowMs: number = Date.now(),
): boolean {
  if (app.status !== "applied" && app.status !== "oa" && app.status !== "interviewing") return false;
  if (app.status_changed_at === null) return false;
  const changed = new Date(app.status_changed_at).getTime();
  return changed < nowMs - STALE_DAYS * 24 * 60 * 60 * 1000;
}
