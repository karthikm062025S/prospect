"use client";

// Task 3 L5 (T5/K1): the one native-<select> correction control, shared by
// components/role-row.tsx and components/role-detail-pane.tsx (role-detail-pane
// already imports FROM role-row, so a shared home for VISA_LABELS here — rather
// than exporting it out of either of those two files — avoids a circular
// import). Rung 1 of the km-ui ladder: a native <select> gives keyboard focus,
// arrow-key selection and a screen-reader-correct control for free; no
// dropdown/listbox primitive is installed in this project to reach for at
// rung 2.
import type { CorrectionField } from "@/lib/corrections";

// The four visa_class values a role or a correction can hold (lib/types.ts
// VisaClass). "clean" is never written by the rules engine (lib/gate-rules.ts
// only emits no_sponsors/citizen_required/question or abstains null) — it only
// ever appears as a user's own correction.
export const VISA_LABELS: Record<string, string> = {
  clean: "No visa flags",
  question: "Work-auth unclear, verify on the posting",
  no_sponsors: "No sponsorship flagged",
  citizen_required: "Citizenship / clearance required",
};

// Sentinel for the leading "Shared label" option. Never sent to
// correctRoleAction — selecting it calls onUncorrect instead.
const SHARED_OPTION = "__shared__";

export function CorrectionControl({
  label,
  field,
  value,
  isCorrected,
  options,
  pending,
  onCorrect,
  onUncorrect,
}: {
  label: string;
  field: CorrectionField;
  value: string | null;
  isCorrected: boolean;
  options: { value: string; label: string }[];
  pending: boolean;
  onCorrect: (field: CorrectionField, value: string) => void;
  onUncorrect: (field: CorrectionField) => void;
}) {
  const selectId = `correction-${field}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={selectId} className="font-label text-[11px] uppercase tracking-label text-text-dim">
          {label}
        </label>
        {isCorrected ? (
          <span className="font-label text-[11px] uppercase tracking-label text-sage">your correction</span>
        ) : null}
      </div>
      <select
        id={selectId}
        value={value ?? SHARED_OPTION}
        disabled={pending}
        aria-busy={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (next === SHARED_OPTION) onUncorrect(field);
          else onCorrect(field, next);
        }}
        className="min-h-11 border border-hairline bg-raised px-2 font-sans text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value={SHARED_OPTION}>Shared label</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
