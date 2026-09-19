// Season derivation (MISSION v7 D8, contract V4, 2026-09-02). Pure, no imports —
// runs both server-side at ingest (lib/upsert-role.ts) and in the SQL backfill's
// TypeScript-authored twin (the season backfill that ran before the Lakebase port). Anchor
// date for "bare season word, no year" resolution is fixed at 2026-09-02 (the
// mission's decision date), NOT "today" — so results are deterministic and never
// drift as the calendar advances.
//
// Rule order (title, then text, each run through the SAME pipeline):
//   1. explicit "winter" (any year, or none) -> unspecified — no winter season
//      exists in our enum, so it is never guessed into one.
//   2. explicit season + year we DO cover (summer'27, fall'27, spring'28,
//      summer'28) -> that season.
//   3. explicit season + a year we do NOT cover (e.g. "Summer 2026",
//      "Fall 2029") -> unspecified. A stated-but-unsupported year is a
//      definite signal, not an invitation to guess the nearest one.
//   4. "co-op"/"coop"/"cooperative education" with no explicit season word
//      -> coop.
//   5. bare season word, no year attached -> the nearest UPCOMING instance of
//      that season relative to the 2026-09-02 anchor: summer -> summer_2027,
//      fall/autumn -> fall_2027, spring -> spring_2028 (there is no
//      spring_2027 value, so spring always resolves to the next one we track).
//   6. a bare "2027" alongside "intern" (no season word at all) -> summer_2027
//      (summer is the dominant intern term). Any other bare year -> unspecified.
//   7. nothing matched -> unspecified.

export type Season =
  | "summer_2027"
  | "fall_2027"
  | "spring_2028"
  | "summer_2028"
  | "coop"
  | "unspecified";

export const SEASON_LABEL: Record<Season, string> = {
  summer_2027: "Summer 2027",
  fall_2027: "Fall 2027",
  spring_2028: "Spring 2028",
  summer_2028: "Summer 2028",
  coop: "Co-op",
  // v7 S4 LANDING-FLOW: "Unspecified" reads like a bug on a filter pill.
  // Two thirds of open postings never name a term in their title, so this is
  // the biggest bucket on the landing and it has to say plainly what it is.
  unspecified: "Term not stated",
};

export const SEASON_ORDER: Season[] = [
  "summer_2027",
  "fall_2027",
  "spring_2028",
  "summer_2028",
  "coop",
  "unspecified",
];

const WINTER = /\bwinter\b/i;
const COOP = /\bco-?op\b|\bcooperative education\b/i;
const INTERN = /\bintern(?:ships?|s)?\b/i;
const BARE_YEAR_2027 = /\b2027\b/;

// A season word immediately followed (within a short punctuation/whitespace
// gap) by a 2- or 4-digit year, e.g. "Summer 2027", "Summer '27", "Su27",
// "Fall-2027", "Spring 28".
const GAP = "['\\s-]{0,3}";
const summerYear = (yy: string) => new RegExp(`\\b(?:summer|su)${GAP}(?:20)?${yy}\\b`, "i");
const fallYear = (yy: string) => new RegExp(`\\b(?:fall|autumn)${GAP}(?:20)?${yy}\\b`, "i");
const springYear = (yy: string) => new RegExp(`\\bspring${GAP}(?:20)?${yy}\\b`, "i");

const SUMMER_2027 = summerYear("27");
const FALL_2027 = fallYear("27");
const SPRING_2028 = springYear("28");
const SUMMER_2028 = summerYear("28");

// Same season words but with ANY 2-digit year attached — used to detect a
// stated-but-unsupported year (e.g. "Summer 2026", "Fall 2029") so it is not
// mistaken for the bare-word case below.
const SUMMER_ANY_YEAR = new RegExp(`\\b(?:summer|su)${GAP}(?:20)?\\d{2}\\b`, "i");
const FALL_ANY_YEAR = new RegExp(`\\b(?:fall|autumn)${GAP}(?:20)?\\d{2}\\b`, "i");
const SPRING_ANY_YEAR = new RegExp(`\\bspring${GAP}(?:20)?\\d{2}\\b`, "i");

const BARE_SUMMER = /\bsummer\b/i;
const BARE_FALL = /\b(?:fall|autumn)\b/i;
const BARE_SPRING = /\bspring\b/i;

function classify(s: string): Season {
  if (!s) return "unspecified";
  if (WINTER.test(s)) return "unspecified";
  if (SUMMER_2027.test(s)) return "summer_2027";
  if (FALL_2027.test(s)) return "fall_2027";
  if (SPRING_2028.test(s)) return "spring_2028";
  if (SUMMER_2028.test(s)) return "summer_2028";
  if (SUMMER_ANY_YEAR.test(s) || FALL_ANY_YEAR.test(s) || SPRING_ANY_YEAR.test(s)) return "unspecified";
  if (COOP.test(s)) return "coop";
  if (BARE_SUMMER.test(s)) return "summer_2027";
  if (BARE_FALL.test(s)) return "fall_2027";
  if (BARE_SPRING.test(s)) return "spring_2028";
  if (INTERN.test(s) && BARE_YEAR_2027.test(s)) return "summer_2027";
  return "unspecified";
}

export function deriveSeason(title: string, text?: string | null): Season {
  const fromTitle = classify(title);
  if (fromTitle !== "unspecified") return fromTitle;
  return classify(text ?? "");
}

/**
 * The landing's season pills (v7 S4 LANDING-FLOW).
 *
 * `counts` is the number of OPEN roles per season over the whole open set, not
 * a facet of the 24-row preview: the preview drew the latest 24 rows and
 * derived its options from them, so a term with hundreds of open roles could
 * be missing from the filter entirely while "Term not stated" showed 24.
 *
 * Pure, zero imports, so `npm test` can exercise it directly. The returned
 * shape is structurally `FilterChipItem` (components/filter-chips.tsx) without
 * importing a client module into lib/.
 */
export function seasonChipItems(
  counts: Partial<Record<Season, number>>,
): { key: string; label: string; count: number }[] {
  const present = SEASON_ORDER.filter((season) => (counts[season] ?? 0) > 0);
  const total = present.reduce((sum, season) => sum + (counts[season] ?? 0), 0);
  return [
    { key: "all", label: "All", count: total },
    ...present.map((season) => ({
      key: season,
      label: SEASON_LABEL[season],
      count: counts[season] as number,
    })),
  ];
}
