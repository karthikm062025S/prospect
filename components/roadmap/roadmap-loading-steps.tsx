"use client";

import type { RoadmapStepKey } from "@/lib/agents/roadmap";

// Same dot+label contract as components/loading-steps.tsx (pending / running /
// done-with-label / error, aria-live, a named step never a bare spinner --
// CONTEXT 13:25 "no spinner without a numbered step"). That component's
// STEP_ORDER is hardcoded to the Profile agent's 3 steps (transcript/resume/
// profile) and is out of this lane's fence to edit, so the Roadmap agent's 5
// different steps get their own small twin here instead of a straight import.
export type RoadmapStepState =
  | { status: "pending" }
  | { status: "running" }
  | { status: "done"; label: string }
  | { status: "error"; message: string };

const STEP_ORDER: Array<{ key: RoadmapStepKey; pendingLabel: string }> = [
  { key: "profile", pendingLabel: "Reading your profile" },
  { key: "catalog", pendingLabel: "Pulling the VT catalog" },
  { key: "certifications", pendingLabel: "Searching for certifications" },
  { key: "planning", pendingLabel: "Planning your semesters" },
  { key: "validating", pendingLabel: "Validating against the catalog" },
];

export function RoadmapLoadingSteps({ states }: { states: Record<RoadmapStepKey, RoadmapStepState> }) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Building your roadmap">
      {STEP_ORDER.map(({ key, pendingLabel }) => {
        const state = states[key];
        return (
          <li key={key} className="flex items-center gap-3 text-sm" aria-live="polite">
            <StepIcon state={state} />
            <span className={state.status === "error" ? "text-danger" : "text-text"}>
              {state.status === "done" ? state.label : state.status === "error" ? state.message : `${pendingLabel}…`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepIcon({ state }: { state: RoadmapStepState }) {
  const base = "h-5 w-5 shrink-0 rounded-full border";
  if (state.status === "done") return <span className={`${base} border-sage bg-sage`} aria-hidden />;
  if (state.status === "error") return <span className={`${base} border-danger bg-danger`} aria-hidden />;
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
