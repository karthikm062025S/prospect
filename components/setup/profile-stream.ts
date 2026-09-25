// The /api/profile NDJSON contract on the client side: five
// fixed steps in this order, each arriving as {step,label,count}, then
// {done:true} or {error}. Pure module (no React) so tests/require-profile.test.ts
// proves done -> /journey and error -> the running step by name.

export const STEP_KEYS = ["transcript", "resume", "profile", "match", "roadmap"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export type StepState =
  | { status: "pending" }
  | { status: "running" }
  | { status: "done"; label: string; count: number }
  | { status: "error"; message: string };

export type StepStates = Record<StepKey, StepState>;

export type StreamEvent = { step?: string; label?: string; count?: number; error?: string; done?: boolean };

export function initialSteps(): StepStates {
  return {
    transcript: { status: "running" },
    resume: { status: "pending" },
    profile: { status: "pending" },
    match: { status: "pending" },
    roadmap: { status: "pending" },
  };
}

export function applyStreamEvent(
  states: StepStates,
  event: StreamEvent,
): { states: StepStates; navigateTo?: string; error?: string } {
  if (event.error) {
    const running = STEP_KEYS.find((key) => states[key].status === "running") ?? STEP_KEYS[0];
    return { states: { ...states, [running]: { status: "error", message: event.error } }, error: event.error };
  }
  if (event.done) return { states, navigateTo: "/journey" };
  if (event.step && (STEP_KEYS as readonly string[]).includes(event.step)) {
    const key = event.step as StepKey;
    const next: StepStates = { ...states, [key]: { status: "done", label: event.label ?? "", count: event.count ?? 0 } };
    const following = STEP_KEYS[STEP_KEYS.indexOf(key) + 1];
    if (following && next[following].status === "pending") next[following] = { status: "running" };
    return { states: next };
  }
  return { states };
}
