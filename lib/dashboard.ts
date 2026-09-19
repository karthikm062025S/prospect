import type { QueryFn } from "./db";
import type { AppStatus } from "./types";

export type DashboardSummary = {
  total_applications: number;
  by_status: Record<AppStatus, number>;
  open_watched_companies: number;
};

const STATUSES: AppStatus[] = ["applied", "oa", "interviewing", "offer", "rejected", "withdrawn"];

// Kept out of any component render body — eslint's react-hooks/purity rule
// flags a direct `Date.now()` call inside a component as an impure render.
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function daysAgoDate(days: number): string {
  return daysAgoIso(days).slice(0, 10);
}

// Read "now" outside a component render body (react-hooks/purity flags a bare
// Date.now() inside a component). Server pages call this once at the top.
export function nowMs(): number {
  return Date.now();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Format a date-only value ("2026-07-14", or a timestamp whose first 10 chars are
// the calendar date) as "Jul 14, 2026" WITHOUT constructing a Date. new
// Date("2026-07-14") parses as UTC midnight and renders the PREVIOUS day in a
// negative-offset timezone (ET) — that off-by-one is why applied/posted dates
// looked wrong. Parsing the components directly keeps the date exactly as stored.
export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const [, y, mo, d] = m;
  return `${MONTHS[Number(mo) - 1] ?? mo} ${Number(d)}, ${y}`;
}

// Coarse relative time for the watcher one-liner (e.g. "3h ago", "2d ago").
export function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((now - then) / (60 * 1000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Shared by the dashboard header and the get_dashboard_summary MCP tool.
export async function getDashboardSummary(q: QueryFn, uid: string): Promise<DashboardSummary> {
  const [apps, [watch]] = await Promise.all([
    q<{ status: AppStatus }>("select status from applications where user_id = $1", [uid], "applications"),
    q<{ n: number }>(
      "select count(*)::int as n from companies where is_watched = true and watch_status = 'open'",
      [],
      "companies",
    ),
  ]);

  const by_status = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<AppStatus, number>;
  for (const row of apps) by_status[row.status] += 1;

  return {
    total_applications: apps.length,
    by_status,
    open_watched_companies: watch.n,
  };
}
