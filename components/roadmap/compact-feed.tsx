"use client";

// "Live feed" (right column, CONTEXT 12:50 Layout): the newest 30 open
// postings, no ranking yet -- reuses components/role-row.tsx (the same row
// Home renders) rather than a second row component. Read-only here: every
// handler is a local no-op, since this is a passive display, not the
// interactive Home list (save/hide/apply live only there).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RoleRow, type HomeRow } from "@/components/role-row";

const noop = () => {};

export function CompactFeed({ rows, nowMs }: { rows: HomeRow[] | null; nowMs: number }) {
  const router = useRouter();
  // ponytail: one text filter over title/company/family; Home's full filter
  // bar is the upgrade path if the compact column ever needs facets.
  const [filter, setFilter] = useState("");
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
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? ordered.filter((row) =>
        [row.title, row.company_name, row.family, row.location ?? ""].some((v) => v?.toLowerCase().includes(needle)),
      )
    : ordered;
  return (
    <>
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={`Filter ${rows.length} postings by title, company, family or location`}
        aria-label="Filter the feed"
        className="w-full border border-hairline bg-raised px-3 py-2 text-[13px] text-text placeholder:text-text-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-sage"
        style={{ borderRadius: "var(--radius-card, 16px)" }}
      />
      {shown.length === 0 ? (
        <p className="text-[13px] text-text-dim">No postings match &ldquo;{filter.trim()}&rdquo;.</p>
      ) : null}
    <ul className="flex flex-col border border-hairline" style={{ borderRadius: "var(--radius-card, 16px)" }}>
      {shown.map((row) => (
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
          onSelect={(id) => router.push(`/?r=${id}`)}
          onToggleSelect={noop}
          onConfirmApplied={noop}
          onSave={noop}
          onHide={noop}
          onRequestDelete={noop}
          confirmError={null}
        />
      ))}
    </ul>
    </>
  );
}
