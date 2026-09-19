"use client";

import { useState } from "react";
import type { Outreach } from "@/lib/types";
import { safeHttpUrl } from "@/lib/types";
import { TrashIcon } from "@/components/icons";
import {
  setOutreachStatusAction,
  deleteOutreachAction,
  deleteOutreachesAction,
} from "@/app/(app)/outreach/actions";

// Serializable group the server page hands down — grouping + sorting already
// done there, this component only renders and tracks selection.
export type OutreachGroup = {
  companyName: string;
  rows: Outreach[];
};

const smallBtn =
  "inline-flex min-h-11 items-center rounded-sm px-2 font-label text-[11px] tracking-label uppercase text-text-dim hover:bg-raised hover:text-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage";
const barButton =
  "inline-flex min-h-11 items-center border border-hairline px-3 font-label text-[11px] tracking-label uppercase text-danger hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:text-text-dim disabled:hover:bg-transparent";

// drafted/replied/call need the owner's attention → sage; sent is waiting; dead is closed.
const statusClass: Record<string, string> = {
  drafted: "text-sage",
  sent: "text-text-dim",
  replied: "text-sage",
  call: "text-sage",
  dead: "text-text-dim line-through",
};
const NEXT_STATUSES = ["sent", "replied", "call", "dead"] as const;

// mailto for an email handle, http(s) link otherwise. Null = not linkable.
function handleHref(handle: string | null): string | null {
  if (!handle) return null;
  if (handle.includes("@") && !handle.includes("://")) return `mailto:${handle}`;
  return safeHttpUrl(handle) ?? null;
}

function OutreachCard({
  row,
  today,
  selected,
  onToggle,
}: {
  row: Outreach;
  today: string;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const overdue = !!row.follow_up_at && row.status === "sent" && row.follow_up_at < today;
  const href = handleHref(row.contact_handle);
  return (
    <li className="flex flex-col gap-2 border border-hairline bg-raised p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
          <input
            type="checkbox"
            aria-label={`Select outreach to ${row.contact_name}`}
            checked={selected}
            onChange={() => onToggle(row.id)}
            className="h-4 w-4 accent-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </label>
        <span className={`font-label text-[11px] tracking-label uppercase ${statusClass[row.status] ?? "text-text"}`}>
          {row.status}
        </span>
        {row.role_label ? <span className="text-text-dim">{row.role_label}</span> : null}
        <span className="font-label text-[11px] tracking-label uppercase text-text-dim">· {row.channel}</span>
        <span className="ml-auto flex items-center gap-2">
          {row.sent_at ? (
            <span className="font-mono text-[11px] text-text-dim">Sent {row.sent_at}</span>
          ) : null}
          {row.follow_up_at ? (
            <span className={`font-mono text-[11px] ${overdue ? "text-sage" : "text-text-dim"}`}>
              {overdue ? "Follow up ▸ " : "Follow up "}
              {row.follow_up_at}
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="text-text">{row.contact_name}</span>
        {row.contact_title ? <span className="text-text-dim">· {row.contact_title}</span> : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-label text-[11px] tracking-label uppercase text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            {row.channel === "email" ? "email ↗" : "profile ↗"}
          </a>
        ) : null}
      </div>

      {row.message ? (
        <pre className="whitespace-pre-wrap border-l-2 border-hairline pl-3 font-sans text-xs text-text-dim">
          {row.message}
        </pre>
      ) : null}

      <div className="flex flex-wrap items-center gap-1 border-t border-hairline pt-2">
        <span className="font-label text-[11px] tracking-label uppercase text-text-dim">mark:</span>
        {NEXT_STATUSES.filter((s) => s !== row.status).map((s) => (
          <form key={s} action={setOutreachStatusAction}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="status" value={s} />
            <button className={smallBtn}>{s}</button>
          </form>
        ))}
        <form action={deleteOutreachAction} className="ml-auto">
          <input type="hidden" name="id" value={row.id} />
          <button aria-label="Delete outreach" className={smallBtn}>
            <TrashIcon />
          </button>
        </form>
      </div>
    </li>
  );
}

export function OutreachList({ groups, today }: { groups: OutreachGroup[]; today: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Only ids still on screen count as selected — guards against a stale id
  // lingering after a delete revalidates the list.
  const allRows = groups.flatMap((g) => g.rows);
  const selectedIds = allRows.filter((r) => selected.has(r.id)).map((r) => r.id);

  return (
    <div className="flex flex-col gap-6">
      {/* Bulk action bar — sticky so it stays in reach as the list grows */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-hairline bg-bg py-2">
        <span className="font-label text-[11px] tracking-label uppercase text-text-dim">
          <span className="font-sans tabular-nums">{selectedIds.length}</span> selected
        </span>
        <form action={deleteOutreachesAction}>
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="id" value={id} />
          ))}
          <button className={barButton} disabled={selectedIds.length === 0}>
            Delete selected
          </button>
        </form>
      </div>

      {groups.map((group) => (
        <section key={group.companyName}>
          <h2 className="mb-2 border-b border-hairline pb-1 font-label text-[11px] tracking-label uppercase text-text-dim">
            {group.companyName}{" "}
            <span className="font-sans tabular-nums text-text/35">({group.rows.length})</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => (
              <OutreachCard
                key={row.id}
                row={row}
                today={today}
                selected={selected.has(row.id)}
                onToggle={toggle}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
