// RB-025: the Applications left list — sort by date applied (default,
// newest first) or company A-Z, plus a text filter over company + role
// title. Pure, injectable inputs, no I/O; the client component renders it.
//
// v5 (D29) adds the status chips (All · Applied · OA · Interviewing · Offer ·
// Closed) and the merged Timeline stream. Both stay pure here so the tests
// own the behaviour and the component only renders.
import type { AppStatus, ApplicationDetailRow, EventRow } from "@/lib/types";

export type ApplicationsSort = "date" | "company";

export type ApplicationsListRow = {
  id: string;
  company_name: string;
  role: string;
  date_applied: string;
};

// The page joins the company's careers_url for the round avatar; lib/types.ts
// is owned by another lane this round, so the joined shape lives here.
export type ApplicationsRow = ApplicationDetailRow & { careers_url: string | null };

export function buildApplicationsList<T extends ApplicationsListRow>(
  rows: readonly T[],
  opts: { sort: ApplicationsSort; query: string },
): T[] {
  const q = opts.query.trim().toLowerCase();
  const kept = q
    ? rows.filter((r) => r.company_name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q))
    : [...rows];
  const byCompany = (a: T, b: T) => a.company_name.localeCompare(b.company_name, undefined, { sensitivity: "base" });
  const byDateDesc = (a: T, b: T) => (a.date_applied < b.date_applied ? 1 : a.date_applied > b.date_applied ? -1 : 0);
  return kept.sort(
    opts.sort === "company"
      ? (a, b) => byCompany(a, b) || byDateDesc(a, b)
      : (a, b) => byDateDesc(a, b) || byCompany(a, b),
  );
}

// L8 audit item 4c: the Applications page joins roles_public for posted_at/
// deadline, but only needs the roles a user actually applied to — this picks
// those ids out so the page can `.in("id", roleIds)` instead of scanning the
// whole shared feed. Pure; unique + drops nulls (an off-app apply has none).
export function linkedRoleIds(rows: readonly { role_id: string | null }[]): string[] {
  return [...new Set(rows.map((r) => r.role_id).filter((id): id is string => id !== null))];
}

// --- status chips (D29) ----------------------------------------------------
// "Closed" folds `rejected` together with the legacy `withdrawn` status so no
// application can fall out of every chip (the counts must add up to the total).
export const STATUS_CHIPS = ["all", "applied", "oa", "interviewing", "offer", "closed"] as const;
export type StatusChip = (typeof STATUS_CHIPS)[number];

export const CHIP_LABELS: Record<StatusChip, string> = {
  all: "All",
  applied: "Applied",
  oa: "OA",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};

export function parseChip(value: string | null | undefined): StatusChip {
  const v = (value ?? "").toLowerCase();
  return (STATUS_CHIPS as readonly string[]).includes(v) ? (v as StatusChip) : "all";
}

export function chipMatches(chip: StatusChip, status: AppStatus): boolean {
  if (chip === "all") return true;
  if (chip === "closed") return status === "rejected" || status === "withdrawn";
  return status === chip;
}

export function filterByChip<T extends { status: AppStatus }>(rows: readonly T[], chip: StatusChip): T[] {
  return chip === "all" ? [...rows] : rows.filter((r) => chipMatches(chip, r.status));
}

export function chipCounts<T extends { status: AppStatus }>(rows: readonly T[]): Record<StatusChip, number> {
  const counts = { all: 0, applied: 0, oa: 0, interviewing: 0, offer: 0, closed: 0 };
  for (const row of rows) for (const chip of STATUS_CHIPS) if (chipMatches(chip, row.status)) counts[chip] += 1;
  return counts;
}

// --- timeline --------------------------------------------------------------
// The Timeline is the entries the signed-in user wrote, newest first.
export type TimelineItem = { id: string; at: string; event: EventRow };

export function buildTimeline(
  events: readonly EventRow[],
  extra: readonly TimelineItem[] = [],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...events.filter(isManualEntry).map((event): TimelineItem => ({ id: event.id, at: event.received_at, event })),
    ...extra,
  ];
  // `at` mixes `+00:00` (DB rows) and `.000Z` (the client's optimistic draft)
  // offset notation — string comparison sorts those inconsistently even
  // though they're the same instant. Date.parse compares the real instants.
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

// A manual entry is authored by the UI and is the only timeline row exposed.
export function isManualEntry(event: Pick<EventRow, "classified_by">): boolean {
  return event.classified_by === "user";
}
