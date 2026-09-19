"use client";

// A multi-select chip row (role types, dream tier). Not FilterChips: that
// component is single-active with a sliding pill (a filter), this one toggles
// any number of chips on/off (a selection) -- same visual language, different
// interaction, so it stays its own small component rather than forcing a
// single-select primitive into a multi-select job.
export function ChipToggleGroup({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-label text-[11px] uppercase tracking-label text-text-dim">{legend}</legend>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={legend}>
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(option)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                isSelected
                  ? "border-transparent bg-text text-bg"
                  : "border-text-dim text-text-dim hover:bg-raised hover:text-text"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
