"use client";

// Home sort control (RB-003/004): native <select> styled to house tokens
// (ladder rung 1 — the app already uses native selects). The chosen sort
// persists to localStorage.home_sort and is read through
// useSyncExternalStore (the theme-toggle pattern) so SSR renders the
// RB-002 default with no hydration mismatch.
import { useSyncExternalStore } from "react";
import { HOME_SORTS, type HomeSort } from "@/lib/sort";
import { SortIcon } from "@/components/icons";

export const HOME_SORT_KEY = "home_sort";

// D23: the "Fit score" option went with lib/fit.ts. D8: "Deadline" removed.
// L2c: "Best match" (the Match agent's score) is the new default once scores
// exist -- see useHomeSort's `fallback` param below.
const LABELS: Record<HomeSort, string> = {
  best_match: "Best match",
  recent: "Recently added",
  company: "Company A–Z",
  title: "Title A–Z",
};

// In-memory fallback so the sort still switches when localStorage throws
// (private mode, quota) — persistence is best-effort (RB-004).
let memorySort: HomeSort | null = null;
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function setHomeSort(next: HomeSort) {
  memorySort = next;
  try {
    localStorage.setItem(HOME_SORT_KEY, next);
  } catch {
    // in-session sort still applies via memorySort
  }
  listeners.forEach((cb) => cb());
}

// The persisted sort, shared by SortControl and the list owner. `fallback`
// (L2c) is what a caller with no stored preference sees: HomeList passes
// "best_match" once the Match agent has scored the feed, "recent" otherwise
// -- an EXPLICIT stored choice (memorySort or localStorage) always wins over
// either fallback, so this only changes the never-touched-sort default.
export function useHomeSort(fallback: HomeSort = "recent"): [HomeSort, (sort: HomeSort) => void] {
  const getSnapshot = (): HomeSort => {
    if (memorySort) return memorySort;
    try {
      const raw = localStorage.getItem(HOME_SORT_KEY);
      return HOME_SORTS.includes(raw as HomeSort) ? (raw as HomeSort) : fallback;
    } catch {
      return fallback;
    }
  };
  const getServerSnapshot = (): HomeSort => fallback;
  return [useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot), setHomeSort];
}

export function SortControl({ value, onChange }: { value: HomeSort; onChange: (sort: HomeSort) => void }) {
  return (
    <label className="inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-text-dim hover:bg-raised">
      <SortIcon />
      <span className="sr-only">Sort roles</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as HomeSort)}
        className="min-h-11 border border-hairline bg-transparent px-2 font-label text-[11px] uppercase tracking-label text-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        {HOME_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {LABELS[sort]}
          </option>
        ))}
      </select>
    </label>
  );
}
