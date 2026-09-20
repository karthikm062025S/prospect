"use client";

// CompanyGroup (RB-005, doc 4 §6, v5 D31): header row (round company avatar,
// name, count) over its RoleRows — rendered only when the company has more than
// one role (1-role groups render as a bare RoleRow in HomeList). Collapsed by
// default to the newest role with a "show N more" expander (the Shneiderman
// overview-first rule, doc 6 §6).
import type { ReactNode } from "react";
import { CompanyAvatar } from "@/components/company-avatar";
import { CaretDownIcon } from "@/components/icons";

export function CompanyGroup({
  name,
  url,
  count,
  expanded,
  onToggle,
  first,
  rest,
}: {
  name: string;
  url: string | null;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  first: ReactNode;
  rest: ReactNode;
}) {
  return (
    <li className="border-b border-hairline">
      {/* D10: the same 12x16 row rhythm as every RoleRow beneath it. */}
      <div className="flex items-center gap-2 bg-raised px-4 py-3 text-text">
        <CompanyAvatar name={name} url={url} size={28} />
        <span className="font-sans text-sm font-medium">{name}</span>
        <span className="ml-auto font-sans text-[11px] tabular-nums text-text-dim">{count}</span>
      </div>
      <ul className="pl-2">
        {first}
        {expanded ? rest : null}
      </ul>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="inline-flex min-h-11 items-center gap-1 rounded-pill px-2 font-label text-[11px] tracking-label uppercase text-text-dim hover:bg-bg hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        <span className={expanded ? "rotate-180" : undefined}>
          <CaretDownIcon />
        </span>
        {expanded ? (
          "show fewer"
        ) : (
          <>
            show <span className="font-sans tabular-nums">{count - 1}</span> more
          </>
        )}
      </button>
    </li>
  );
}
