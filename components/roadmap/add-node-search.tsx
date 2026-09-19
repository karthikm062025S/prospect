"use client";

import { useState, useTransition } from "react";

export type CatalogHit = { kind: "course"; code: string; title: string } | { kind: "club"; name: string; description: string };

/** Typeahead over the real catalog (server actions call loadCourseCandidates/loadClubCandidates). Never invents a hit. */
export function AddNodeSearch({
  semester,
  onSearch,
  onAdd,
  onCancel,
}: {
  semester: string;
  onSearch: (keyword: string) => Promise<{ ok: true; data: CatalogHit[] } | { ok: false; error: string }>;
  onAdd: (hit: CatalogHit) => Promise<{ ok: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runSearch(next: string) {
    setQuery(next);
    setError(null);
    if (next.trim().length < 2) {
      setHits([]);
      return;
    }
    startTransition(async () => {
      const res = await onSearch(next.trim());
      if (res.ok) setHits(res.data);
      else {
        setHits([]);
        setError(res.error);
      }
    });
  }

  async function add(hit: CatalogHit) {
    const key = hit.kind === "course" ? hit.code : hit.name;
    setAdding(key);
    setError(null);
    const res = await onAdd(hit);
    setAdding(null);
    if (!res.ok) setError(res.error ?? "Could not add that node.");
  }

  return (
    <div className="flex flex-col gap-2 border border-hairline bg-bg p-3" style={{ borderRadius: "var(--radius-panel, 18px)" }}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="add-node-query" className="font-label text-[11px] uppercase tracking-label text-text-dim">
          Add to {semester}
        </label>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 font-label text-[11px] uppercase tracking-label text-text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          Cancel
        </button>
      </div>
      <input
        id="add-node-query"
        type="text"
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        placeholder="Search VT courses and clubs"
        className="min-h-11 w-full border border-hairline bg-raised px-2 text-[15px] text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      />
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      {isPending ? <p className="text-[13px] text-text-dim">Searching…</p> : null}
      {!isPending && query.trim().length >= 2 && hits.length === 0 && !error ? (
        <p className="text-[13px] text-text-dim">No matches in the VT catalog.</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {hits.map((hit) => {
          const key = hit.kind === "course" ? hit.code : hit.name;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => add(hit)}
                disabled={adding === key}
                className="flex min-h-11 w-full items-center justify-between gap-2 border border-hairline bg-raised px-2 py-1 text-left hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed"
              >
                <span className="min-w-0 truncate text-[15px] text-text">
                  {hit.kind === "course" ? `${hit.code}: ${hit.title}` : hit.name}
                </span>
                <span className="shrink-0 font-label text-[11px] uppercase tracking-label text-text-dim">
                  {adding === key ? "Adding…" : "Add"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
