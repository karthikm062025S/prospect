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

// D9/D10: the heading text ("Ranked for you" once Match has scored the
// caller, "Live feed" until then) and open count are computed here from the
// same real rows page.tsx already fetched -- the card is one bordered panel
// (mock journey.html .feed), matching the roadmap board's card language.
export function CompactFeed({ rows, nowMs }: { rows: HomeRow[] | null; nowMs: number }) {
  const router = useRouter();
  // ponytail: one text filter over title/company/family; Home's full filter
  // bar is the upgrade path if the compact column ever needs facets.
  const [filter, setFilter] = useState("");
  const hasScores = rows?.some((row) => row.matchScore != null) ?? false;
  const heading = hasScores ? "Ranked for you" : "Live feed";
  // L2c: same ranked order as Home once the Match agent has scored the feed
  // -- a no-op (input order preserved) until the caller attaches matchScore
  // to these rows.
  const ordered = rows ? (hasScores ? [...rows].sort((a, b) => (b.matchScore ?? -Infinity) - (a.matchScore ?? -Infinity)) : rows) : [];
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? ordered.filter((row) =>
        [row.title, row.company_name, row.family, row.location ?? ""].some((v) => v?.toLowerCase().includes(needle)),
      )
    : ordered;

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-hairline bg-raised">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-step-2 text-text">{heading}</h2>
          {rows ? (
            <span className="shrink-0 font-label text-[11px] uppercase tracking-label text-text-dim">
              {rows.length} open
            </span>
          ) : null}
        </div>
        {rows && rows.length > 0 ? (
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Title, company, family or location"
            aria-label={`Filter ${rows.length} postings by title, company, family or location`}
            className="min-h-11 w-full rounded-pill border border-hairline bg-bg px-4 text-[13px] text-text placeholder:text-text-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-sage"
          />
        ) : null}
      </div>
      {rows === null ? (
        <p className="px-4 pb-4 text-[13px] text-text-dim">Live feed not available yet.</p>
      ) : rows.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-text-dim">No open postings right now.</p>
      ) : shown.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-text-dim">No postings match &ldquo;{filter.trim()}&rdquo;.</p>
      ) : (
        <ul className="flex flex-col border-t border-hairline">
          {shown.map((row, index) => (
            <RoleRow
              key={row.id}
              row={row}
              riseIndex={index}
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
      )}
    </div>
  );
}
