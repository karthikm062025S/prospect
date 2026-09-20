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
// steps (MISSION D-UI3: exactly these five, in this order). A step with no
// number is a bug, so "done" always renders its count; progress is visible
// throughout (Law 11, 20) and an error names the step it landed on (Law 15).
export function LoadingSteps({ states }: { states: StepStates }) {
  const doneCount = STEP_KEYS.filter((key) => states[key].status === "done").length;
  const current = Math.min(doneCount + 1, STEP_KEYS.length);
  return (
    <div className="flex flex-col gap-3">
      <p className="font-label text-[11px] uppercase tracking-label text-text-dim" aria-live="polite">
        Step {current} of {STEP_KEYS.length}
      </p>
      <ol className="flex flex-col gap-3" aria-label="Building your profile">
        {STEP_KEYS.map((key) => {
          const state = states[key];
          return (
            <li key={key} className="flex items-center gap-3 font-sans text-sm" aria-live="polite">
              <StepIcon state={state} />
              <span className={`flex-1 ${state.status === "error" ? "text-danger" : state.status === "pending" ? "text-text-dim" : "text-text"}`}>
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

function StepIcon({ state }: { state: StepState }) {
  const base = "h-5 w-5 shrink-0 rounded-full border";
  if (state.status === "done") {
    return <span className={`${base} border-sage bg-sage`} aria-hidden />;
  }
  if (state.status === "error") {
    return <span className={`${base} border-danger bg-danger`} aria-hidden />;
  }
  if (state.status === "running") {
    return (
      <span
        className={`${base} border-sage border-t-transparent motion-safe:animate-spin motion-reduce:border-t-sage`}
        aria-hidden
      />
    );
  }
  return <span className={`${base} border-hairline`} aria-hidden />;
}
