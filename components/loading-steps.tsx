"use client";

import { STEP_KEYS, type StepKey, type StepState, type StepStates } from "@/components/setup/profile-stream";

export type { StepKey, StepState };

const PENDING_LABEL: Record<StepKey, string> = {
  transcript: "Reading your transcript",
  resume: "Reading your resume",
  profile: "Building your profile",
  match: "Ranking the live feed for you",
  roadmap: "Planning your roadmap",
};

// Pending / running / done-with-count / error, per the agent's real NDJSON
// steps. A step with no
// number is a bug, so "done" always renders its count; progress is visible
// throughout (Law 11, 20) and an error names the step it landed on (Law 15).
export function LoadingSteps({ states }: { states: StepStates }) {
  const doneCount = STEP_KEYS.filter((key) => states[key].status === "done").length;
  const current = Math.min(doneCount + 1, STEP_KEYS.length);
  return (
    <div className="flex flex-col gap-3">
      {/* Visual label lives on the card heading (setup-form.tsx); this stays
          sr-only so screen readers still get the live step count (Law 11, 20)
          without the mock's static "Running · every step shows a real count"
          losing its place to a redundant visible line. */}
      <p className="sr-only" aria-live="polite">
        Step {current} of {STEP_KEYS.length}
      </p>
      <ol className="flex flex-col gap-3" aria-label="Building your profile">
        {STEP_KEYS.map((key, index) => {
          const state = states[key];
          return (
            <li key={key} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 font-sans text-sm" aria-live="polite">
              <StepIcon state={state} index={index + 1} />
              <span className={`min-w-0 ${state.status === "error" ? "text-danger" : state.status === "pending" ? "text-text-dim" : "text-text"}`}>
                {state.status === "done"
                  ? state.label
                  : state.status === "error"
                    ? `${PENDING_LABEL[key]}: ${state.message}`
                    : `${PENDING_LABEL[key]}…`}
              </span>
              {state.status === "done" && !/\d/.test(state.label) && (
                <span className="font-sans text-sm tabular-nums text-text-dim">{state.count}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepIcon({ state, index }: { state: StepState; index: number }) {
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-label text-[11px]";
  if (state.status === "done") {
    return (
      <span className={`${base} border-sage bg-sage text-bg`} aria-hidden>
        {index}
      </span>
    );
  }
  if (state.status === "error") {
    return (
      <span className={`${base} border-danger bg-danger text-bg`} aria-hidden>
        {index}
      </span>
    );
  }
  if (state.status === "running") {
    return (
      <span className={`${base} border-accent text-text motion-safe:animate-pulse`} aria-hidden>
        {index}
      </span>
    );
  }
  return (
    <span className={`${base} border-hairline text-text-dim`} aria-hidden>
      {index}
    </span>
  );
}
