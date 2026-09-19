"use client";

// SaveIndicator (doc 4 §6): per-field idle / saving / saved (fades after
// 1.5 s) / error (persists, with retry). useFieldSave is the state machine
// behind it — one per autosaving field; `run` takes the save thunk so retry
// can re-run the exact same write.
import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/app/actions";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useFieldSave() {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastRun = useRef<(() => Promise<ActionResult>) | null>(null);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  async function run(fn: () => Promise<ActionResult>) {
    lastRun.current = fn;
    const id = ++seq.current;
    if (timer.current !== null) window.clearTimeout(timer.current);
    setState("saving");
    setError(null);
    const res = await fn().catch(() => ({ ok: false as const, error: "network error" }));
    if (id !== seq.current) return; // a newer save superseded this one
    if (res.ok) {
      setState("saved");
      timer.current = window.setTimeout(() => setState("idle"), 1500);
    } else {
      setState("error");
      setError(res.error);
    }
  }

  function retry() {
    if (lastRun.current) void run(lastRun.current);
  }

  return { state, error, run, retry };
}

export function SaveIndicator({
  state,
  error,
  onRetry,
}: {
  state: SaveState;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex min-h-11 items-center gap-2 font-label text-[11px] tracking-label uppercase"
    >
      {state === "saving" ? <span className="text-text-dim">Saving…</span> : null}
      {state === "saved" || state === "idle" ? (
        // Stays mounted through idle so the 1.5 s "Saved" can fade out
        // (240 ms exit; instant under reduced motion via globals.css).
        <span
          aria-hidden={state !== "saved"}
          className={`text-sage transition-opacity duration-[240ms] ease-[cubic-bezier(0.4,0,1,1)] ${
            state === "saved" ? "opacity-100" : "opacity-0"
          }`}
        >
          Saved
        </span>
      ) : null}
      {state === "error" ? (
        <>
          <span className="normal-case tracking-normal text-danger">
            Couldn&apos;t save{error ? ` (${error})` : ""}.
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 text-sage hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            Retry
          </button>
        </>
      ) : null}
    </span>
  );
}
