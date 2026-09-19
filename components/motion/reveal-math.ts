// v7 D20 — the pure part of the scroll text reveal, split out so it is testable
// without a DOM (tests/text-reveal.test.ts). No imports on purpose: the
// node --experimental-strip-types test runner resolves this file directly by
// its .ts extension, and any extensionless value import from here would fail.

export type Granularity = "char" | "word";

/** A single reveal unit. `text` renders; `lead` is the whitespace before it. */
export type Unit = { text: string; lead: string };

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Splits a statement into reveal units, keeping whole words together so
 * wrapping still breaks between words at either granularity.
 * "char" returns one unit per character; "word" one unit per word.
 */
export function splitUnits(text: string, granularity: Granularity): Unit[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (granularity === "word") {
    return words.map((word, index) => ({ text: word, lead: index === 0 ? "" : " " }));
  }
  const units: Unit[] = [];
  words.forEach((word, wordIndex) => {
    [...word].forEach((char, charIndex) => {
      units.push({ text: char, lead: wordIndex > 0 && charIndex === 0 ? " " : "" });
    });
  });
  return units;
}

/**
 * How many units are fully revealed at `progress` (0..1).
 *
 * The two granularities differ in where the boundary lands, which is the whole
 * point of the prop: "word" SNAPS (a word flips at the midpoint of its own
 * slice, so a word is never half-lit — the integratedbio /company behaviour),
 * "char" SWEEPS (a character counts as revealed only once the boundary has
 * passed it completely, so the boundary can sit mid-word — the integratedbio
 * home-hero behaviour).
 */
export function revealedCount(progress: number, total: number, granularity: Granularity): number {
  if (total <= 0) return 0;
  const raw = clamp01(progress) * total;
  const count = granularity === "word" ? Math.round(raw) : Math.floor(raw);
  return Math.min(total, Math.max(0, count));
}

/**
 * The scroll-progress window over which unit `index` transitions.
 * `overlap` is how many unit-slices the transition spans: 1 is a hard snap
 * (word), >1 lets neighbouring characters cross-fade (char).
 */
export function unitRange(
  index: number,
  total: number,
  granularity: Granularity,
): [number, number] {
  if (total <= 0) return [0, 1];
  const slice = 1 / total;
  const overlap = granularity === "word" ? 1 : 2.5;
  const start = Math.min(1, index * slice);
  const end = Math.min(1, start + slice * overlap);
  // A zero-width window would make the colour interpolation non-monotonic,
  // which Motion hands to the Web Animations API and WAAPI rejects outright.
  return [start, end > start ? end : Math.min(1, start + 1e-4)];
}
