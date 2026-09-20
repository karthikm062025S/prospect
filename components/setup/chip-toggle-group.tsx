"use client";

// A multi-select chip row (role types, dream tier). Not FilterChips: that
// component is single-active with a sliding pill (a filter), this one toggles
// any number of chips on/off (a selection) -- same visual language, different
// interaction, so it stays its own small component rather than forcing a
// single-select primitive into a multi-select job. Every group carries a
// one-line help (Law 14, 19) and shows its error inline (Law 15).
export function ChipToggleGroup({
  legend,
  help,
  options,
  selected,
  onToggle,
  error,
}: {
  legend: string;
  help: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
  error?: string;
}) {
  const id = legend.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? `${id}-help ${id}-error` : `${id}-help`}>
      <legend className="font-sans text-sm font-medium text-text">{legend}</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label={legend}>
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(option)}
              className={`inline-flex min-h-11 items-center rounded-pill border px-4 font-sans text-sm font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised ${
                isSelected
                  ? "border-transparent bg-sage/10 text-sage"
                  : "border-hairline bg-bg text-text hover:border-sage"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      <p id={`${id}-help`} className="font-sans text-xs text-text-dim">
        {help}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="font-sans text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
