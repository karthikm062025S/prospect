"use client";

// The per-posting Human-led / AI-assisted / Automatable bar (CONTEXT "Labels"
// locked 2026-09-19 12:50): scores come only from the published task-exposure
// table (lib/exposure.ts), never an LLM guess, and every empty state is named
// rather than a placeholder number. Three states only:
//   - unmapped: role_tasks has no rows for this posting yet (mapPostingTasks
//     has not run for it -- top-40-only, lib/agents/match.ts).
//   - not measured: role_tasks has rows, but none of them matched a
//     published exposure row (every duty is "unscored").
//   - measured: at least one duty has a real label.
import type { Label } from "@/lib/exposure";

export type LabelCounts = Record<Label, number> | null;

const COVERAGE_TEXT =
  "2,450 of 18,838 O*NET tasks have exposure data (13%). A task the data never covered stays unscored, never guessed.";

function barText(counts: LabelCounts): { text: string; unscoredText: string | null } | null {
  if (counts === null) return null;
  const measured = counts.human_led + counts.ai_assisted + counts.automatable;
  if (measured === 0) return null;
  return {
    text: `${counts.human_led} Human-led · ${counts.ai_assisted} AI-assisted · ${counts.automatable} Automatable`,
    unscoredText: counts.unscored > 0 ? `${counts.unscored} not yet measured` : null,
  };
}

export function LabelsBar({ counts }: { counts: LabelCounts }) {
  const bar = barText(counts);

  return (
    <div className="flex flex-wrap items-center gap-1.5 font-label text-[11px] tracking-label text-text-dim">
      {counts === null ? (
        <span>Duties not mapped to O*NET tasks yet.</span>
      ) : bar === null ? (
        <span>Duties mapped, but none have exposure data yet.</span>
      ) : (
        <>
          <span className="font-sans normal-case tracking-normal">{bar.text}</span>
          {bar.unscoredText ? <span className="font-sans normal-case tracking-normal">&middot; {bar.unscoredText}</span> : null}
        </>
      )}
      <details className="relative inline-block">
        <summary className="cursor-pointer list-none uppercase underline decoration-dotted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage">
          coverage
        </summary>
        <p className="absolute z-10 mt-1 w-64 border border-hairline bg-raised p-2 normal-case tracking-normal text-text-dim shadow-sm">
          {COVERAGE_TEXT}
        </p>
      </details>
    </div>
  );
}
