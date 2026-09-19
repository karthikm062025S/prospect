"use client";

// RB-003: client-side text search over company + title. `/` focuses from
// anywhere (unless already typing somewhere editable), clear button, 120ms
// debounce before the query hits the list. The "nothing matches" empty state
// renders in HomeList (it knows the result count).
import { useEffect, useRef, useState } from "react";
import { MagnifyingGlassIcon, XIcon } from "@/components/icons";

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el.isContentEditable
  );
}

export function SearchInput({ onQuery }: { onQuery: (query: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 120ms debounce (doc 4 §6). Clearing bypasses it below for instant
  // recovery. onQuery is a state setter in practice (stable identity), so
  // listing it costs nothing.
  useEffect(() => {
    const t = window.setTimeout(() => onQuery(value), 120);
    return () => window.clearTimeout(t);
  }, [value, onQuery]);

  // `/` focuses the search from anywhere on the page.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function clear() {
    setValue("");
    onQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="relative inline-flex min-h-11 flex-1 items-center gap-1.5 border border-hairline px-2 text-text-dim focus-within:ring-2 focus-within:ring-sage sm:max-w-xs">
      <MagnifyingGlassIcon />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value !== "") clear();
        }}
        placeholder="Search company or title"
        aria-label="Search company or title"
        className="peer min-w-0 flex-1 bg-transparent py-2 pr-10 text-sm text-text placeholder:text-text-dim focus:outline-none"
      />
      {value === "" ? (
        <kbd
          aria-hidden="true"
          title="Press / to search"
          className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 font-sans text-[11px] text-text-dim border border-hairline rounded px-1.5 [@media(hover:hover)]:inline-flex peer-focus:hidden"
        >
          /
        </kbd>
      ) : null}
      {value !== "" ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-sm text-text-dim hover:bg-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          <XIcon />
        </button>
      ) : null}
    </div>
  );
}
