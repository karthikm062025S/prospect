"use client";

export type StepKey = "transcript" | "resume" | "profile";

export type StepState =
  | { status: "pending" }
  | { status: "running" }
  | { status: "done"; label: string; count: number }
  | { status: "error"; message: string };

const STEP_ORDER: Array<{ key: StepKey; pendingLabel: string }> = [
  { key: "transcript", pendingLabel: "Reading your transcript" },
  { key: "resume", pendingLabel: "Reading your resume" },
  { key: "profile", pendingLabel: "Saving your profile" },
];

// Pending / running / done-with-count / error, per the agent's real NDJSON
// steps -- a step with no number is a bug, so "done" always renders a count.
export function LoadingSteps({ states }: { states: Record<StepKey, StepState> }) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Building your profile">
      {STEP_ORDER.map(({ key, pendingLabel }) => {
        const state = states[key];
        return (
          <li key={key} className="flex items-center gap-3 text-sm" aria-live="polite">
            <StepIcon state={state} />
            <span className={state.status === "error" ? "text-danger" : "text-text"}>
              {state.status === "done"
                ? state.label
                : state.status === "error"
                  ? state.message
                  : `${pendingLabel}…`}
            </span>
          </li>
        );
      })}
    </ol>
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
