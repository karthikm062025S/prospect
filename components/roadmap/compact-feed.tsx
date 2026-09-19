"use client";

// "Live feed" (right column, CONTEXT 12:50 Layout): the newest 30 open
// postings, no ranking yet -- reuses components/role-row.tsx (the same row
// Home renders) rather than a second row component. Read-only here: every
// handler is a local no-op, since this is a passive display, not the
// interactive Home list (save/hide/apply live only there).
import { RoleRow, type HomeRow } from "@/components/role-row";

const noop = () => {};

export function CompactFeed({ rows, nowMs }: { rows: HomeRow[] | null; nowMs: number }) {
  if (rows === null) {
    return <p className="text-[13px] text-text-dim">Live feed not available yet.</p>;
  }
  if (rows.length === 0) {
    return <p className="text-[13px] text-text-dim">No open postings right now.</p>;
  }
  // L2c: same ranked order as Home once the Match agent has scored the feed
  // -- a no-op (input order preserved) until the caller attaches matchScore
  // to these rows.
  const hasScores = rows.some((row) => row.matchScore != null);
  const ordered = hasScores
    ? [...rows].sort((a, b) => (b.matchScore ?? -Infinity) - (a.matchScore ?? -Infinity))
    : rows;
  return (
    <ul className="flex flex-col border border-hairline" style={{ borderRadius: "var(--radius-card, 16px)" }}>
      {ordered.map((row) => (
        <RoleRow
          key={row.id}
          row={row}
          showCompany
          nowMs={nowMs}
          selectMode={false}
          selected={false}
          active={false}
          morphing={false}
          saveExits={false}
          onSelect={noop}
          onToggleSelect={noop}
          onConfirmApplied={noop}
          onSave={noop}
          onHide={noop}
          onRequestDelete={noop}
          confirmError={null}
        />
      ))}
    </ul>
  );
}
