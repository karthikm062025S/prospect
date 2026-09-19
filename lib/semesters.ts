// Pure semester sequencing for the Roadmap agent. No IO, no Databricks, no
// Gemini -- exercised directly by tests/semesters.test.ts.
//
// VT terms (CONTEXT.md Locked 2026-09-19 12:50 "Roadmap"): Spring Jan-May,
// Summer Jun-Aug, Fall Aug-Dec. The brief's own ranges overlap in August;
// resolved here by giving August to Fall (VT's Fall semester starts in late
// August, which is the real-world case this ambiguity has to resolve).

export type Season = "Spring" | "Summer" | "Fall";
export interface TermRef {
  season: string;
  year: number;
}

const ORDER: readonly Season[] = ["Spring", "Summer", "Fall"];

/** Jan-May -> Spring, Jun-Jul -> Summer, Aug-Dec -> Fall (see header for the Aug resolution). */
export function seasonFromDate(date: Date): Season {
  const month = date.getMonth(); // 0 = January
  if (month <= 4) return "Spring";
  if (month <= 6) return "Summer";
  return "Fall";
}

function termKey(season: string, year: number): number {
  const index = ORDER.indexOf(season as Season);
  if (index === -1) throw new Error(`Unknown term season: ${season}`);
  return year * 3 + index;
}

/** "Fall 2026" -> { season: "Fall", year: 2026 }. Throws, naming the label, on anything else. */
export function parseSemesterLabel(label: string): TermRef {
  const match = /^(Spring|Summer|Fall) (\d{4})$/.exec(label.trim());
  if (!match) throw new Error(`Unrecognized semester label: ${label}`);
  return { season: match[1], year: Number(match[2]) };
}

/**
 * Every semester label from `from` to `target`, inclusive, in chronological
 * order (Spring -> Summer -> Fall -> Spring...). Throws when the target is
 * before the starting term -- there is nothing to plan going backwards.
 */
export function semestersFromTerm(from: TermRef, target: TermRef): string[] {
  const startKey = termKey(from.season, from.year);
  const targetKey = termKey(target.season, target.year);
  if (targetKey < startKey) {
    throw new Error(
      `Target term ${target.season} ${target.year} is before the current term ${from.season} ${from.year}`,
    );
  }
  const labels: string[] = [];
  for (let k = startKey; k <= targetKey; k++) {
    labels.push(`${ORDER[k % 3]} ${Math.floor(k / 3)}`);
  }
  return labels;
}

/** semestersFromTerm anchored at a real calendar date instead of a parsed label. */
export function semestersBetween(now: Date, target: TermRef): string[] {
  return semestersFromTerm({ season: seasonFromDate(now), year: now.getFullYear() }, target);
}
