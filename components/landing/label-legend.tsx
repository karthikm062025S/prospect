// The three task labels, each with the one-line definition that CONTEXT 12:50
// requires wherever a label appears, plus the source line that a label never
// ships without.
//
// Two real call sites (the roadmap band and the before/after band), which is
// what earns the shared component.

export const LABELS = [
  {
    name: "Human-led",
    meaning: "the task still turns on a person's judgement.",
    chip: "bg-sage/10 text-sage",
  },
  {
    name: "AI-assisted",
    meaning: "a model makes the task faster, a person still owns the result.",
    chip: "border border-hairline text-text",
  },
  {
    name: "Automatable",
    // Orange is a FILL and never text on --bg / --raised (2.85:1 on raised), so
    // the chip is an orange fill carrying --ink text, plus the 1px --text ring
    // that WCAG 1.4.11 needs on a raised ground (T0 fold note).
    meaning: "the task can already run end to end without a person.",
    chip: "accent-fill-on-raised bg-accent text-ink",
  },
] as const;

export const LABEL_SOURCE =
  "Scores come from published task-exposure tables, O*NET tasks joined to published economic and academic exposure scores, never from a model's guess.";

export function LabelLegend({ className = "" }: { className?: string }) {
  return (
    <dl className={`flex flex-col gap-3 ${className}`.trim()}>
      {LABELS.map((label) => (
        <div key={label.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <dt
            className={`inline-flex shrink-0 items-center rounded-pill px-3 py-1 font-label text-step-2xs uppercase tracking-label ${label.chip}`}
          >
            {label.name}
          </dt>
          <dd className="text-step-0 leading-body text-text-dim">{label.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
