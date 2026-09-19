// Labels come only from published task-exposure evidence, never an LLM guess
// (CONTEXT.md Locked 2026-09-19 12:50 "Labels"; MISSION invariant 2).
//
// Source: Anthropic Economic Index, release_2025_03_27
// (https://huggingface.co/datasets/Anthropic/EconomicIndex). Its
// automation_vs_augmentation(_by_task).csv splits real Claude usage on each
// O*NET task into six interaction types (confirmed via WebFetch of the HF
// dataset card, 2026-09-19): directive and feedback_loop are automation
// (Claude carries the task with little human involvement); task_iteration,
// validation and learning are augmentation (Claude assists while a human
// still drives); filtered is excluded from both. `datasets/build_task_exposure.py`
// (the team's ingestion script) computes automation_share = directive +
// feedback_loop and augmentation_share = task_iteration + validation +
// learning, renormalized over the non-filtered mass, so the two always sum to
// 1 for a task that has any evidence at all. A task the Anthropic index never
// saw (no exposure row) carries no evidence and is "unscored" — never zero-
// filled, never guessed.

export interface ExposureRow {
  automation_share: number;
  augmentation_share: number;
}

export type Label = "human_led" | "ai_assisted" | "automatable" | "unscored";

export const LABELS: Record<Exclude<Label, "unscored">, string> = {
  human_led:
    "Evidence shows Claude mostly assists with validation, iteration or learning on this task, not automation.",
  ai_assisted:
    "Evidence shows a mix: Claude automates part of this task while a human still drives the rest.",
  automatable:
    "Evidence shows Claude mostly carries this task directively or in a feedback loop, with little human involvement.",
};

/** automation_share at or below this maps to human_led. Source: AEI release_2025_03_27 (see header). */
export const HUMAN_LED_MAX = 0.33;
/** automation_share at or above this maps to automatable. Source: AEI release_2025_03_27 (see header). */
export const AUTOMATABLE_MIN = 0.66;

export function labelTask(row: ExposureRow | null | undefined): Label {
  if (!row) return "unscored";
  const { automation_share } = row;
  if (automation_share >= AUTOMATABLE_MIN) return "automatable";
  if (automation_share <= HUMAN_LED_MAX) return "human_led";
  return "ai_assisted";
}

export function summarizeLabels(labels: Label[]): Record<Label, number> {
  const summary: Record<Label, number> = { human_led: 0, ai_assisted: 0, automatable: 0, unscored: 0 };
  for (const label of labels) summary[label] += 1;
  return summary;
}
