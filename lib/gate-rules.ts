import type { VisaClass } from "./types";

// Task 3 L3 (MISSION T4, PRD FR-006): the abstaining sponsorship / citizenship
// / clearance rules. Pure: posting html in, `visa_class` + a plain-words note
// out, null when no table matches. Precedence citizen_required > no_sponsors >
// question. No model, no network, $0. Callers: the JD-capture hook in
// lib/role-jd.ts and the sweep behind app/api/gate-sweep/route.ts, which both
// receive this function injected (no static lib-to-lib value import: the
// strip-types test runner cannot follow one, my_projects/CLAUDE.md).

export type GateResult = { visa_class: VisaClass | null; note: string | null; matched: string | null };

// Every same-sentence window stops at . ; ! ? (fold 2 A4).

// The posting says it will not / cannot / does not sponsor, or wants
// authorization "without sponsorship" now or in the future.
export const NO_SPONSOR_PATTERNS: RegExp[] = [
  /\b(?:unable|not able|not in a position) to (?:offer |provide |support )?(?:visa |work visa |employment |immigration )?sponsor/i,
  /\b(?:will|do|does|can|could|would|shall|must)\s?not\b[^.;!?]{0,30}?\bsponsor/i,
  /\b(?:won't|don't|doesn't|can't|cannot)\b[^.;!?]{0,30}?\bsponsor/i,
  /\bno (?:visa |work visa |employment |immigration |h-?1b )?sponsorship\b/i,
  /\bsponsorship (?:is|will be|will) not (?:be )?(?:available|offered|provided|possible|considered)\b/i,
  /\bsponsorship\b[^.;!?]{0,30}?\bis not available\b/i,
  /\bnot (?:eligible for|offering|providing|able to offer|able to provide) (?:visa |work visa |employment )?sponsorship\b/i,
  // "with or without sponsorship" welcomes both, so it is not a refusal.
  /(?<!\bwith or )\bwithout (?:the need (?:for|of) |requiring |need (?:for|of) |any )?(?:visa |employer |employment |company |current or future |present or future )?(?:visa )?sponsorship\b/i,
];

// Must be a U.S. citizen, citizenship required, ITAR / "U.S. person",
// active or obtainable security clearance required.
export const CITIZEN_PATTERNS: RegExp[] = [
  /\bmust be (?:a |an )?(?:current )?(?:u\.?s\.?a?\.?|united states) citizen/i,
  /\b(?:u\.?s\.?a?\.?|united states) citizenship (?:is )?(?:required|mandatory|a requirement)\b/i,
  /\b(?:requires?|requiring)\b[^.;!?]{0,20}?\b(?:u\.?s\.?|united states) citizenship\b/i,
  /\b(?:u\.?s\.?a?\.?|united states) citizens? only\b/i,
  /\b(?:only|open to) (?:u\.?s\.?a?\.?|united states) citizens\b/i,
  /\b(?:must be|be|are) (?:a |an )?(?:u\.?s\.?|united states) persons?\b/i,
  /\b(?:u\.?s\.?|united states) person (?:status )?(?:is )?required\b/i,
  /\bcitizenship (?:is )?required\b/i,
  /\bITAR\b/,
  /\b(?:active|current|existing) (?:(?:top )?secret |ts\/sci |dod |government |public trust )?(?:security )?clearance\b/i,
  /\b(?:security |secret |top secret |ts\/sci |dod |government |public trust )?clearance (?:is |will be )?(?:required|mandatory|a requirement)\b/i,
  /\b(?:requires?|need|needs|must (?:hold|have|possess))\b[^.;!?]{0,40}?\b(?:security )?clearance\b/i,
  /\b(?:ability|able|eligible|eligibility|willing) to obtain\b[^.;!?]{0,40}?\bclearance\b/i,
  /\bmust (?:be able to )?obtain\b[^.;!?]{0,40}?\bclearance\b/i,
];

// Hedges only: sponsorship may be available, citizenship or clearance preferred,
// sponsorship considered case by case.
export const QUESTION_PATTERNS: RegExp[] = [
  /\bsponsorship (?:may|might|could|can) be (?:available|considered|possible|offered|provided|an option)\b/i,
  /\b(?:may|might|could) (?:be able to )?(?:consider|offer|provide|support) (?:visa |work visa )?sponsorship\b/i,
  /\bsponsorship\b[^.;!?]{0,50}?\b(?:case[- ]by[- ]case|considered|evaluated|reviewed)\b/i,
  /\bconsidered (?:for )?(?:visa )?sponsorship\b/i,
  /\b(?:(?:u\.?s\.?a?\.?|united states) )?citizenship (?:is )?(?:strongly |highly )?preferred\b/i,
  /\b(?:u\.?s\.?a?\.?|united states) citizens? (?:are |is )?(?:strongly |highly )?preferred\b/i,
  /\bclearance (?:is )?(?:strongly |highly )?preferred\b/i,
];

// Fold 2 A3/A6: a CITIZEN or NO_SPONSOR hit whose sentence hedges it
// ("clearance preferred", "may require", "cannot guarantee sponsorship") is a
// question, with the same quote: the hedge IS the signal.
export const HEDGE = /\b(?:preferred|a plus|desired|bonus|nice to have|may (?:be )?require[sd]?|might require|some roles|guarantee)\b/i;

const TABLES: { visa_class: VisaClass; patterns: RegExp[] }[] = [
  { visa_class: "citizen_required", patterns: CITIZEN_PATTERNS },
  { visa_class: "no_sponsors", patterns: NO_SPONSOR_PATTERNS },
  { visa_class: "question", patterns: QUESTION_PATTERNS },
];

export const QUOTE_MAX = 140;
export const NOTE_TAIL: Record<VisaClass, string> = {
  clean: "",
  question: "You can still apply.",
  no_sponsors: "You can still apply.",
  citizen_required: "Check the posting before applying.",
};

// ponytail: the five named entities plus numeric ones, the same table as
// lib/decode-entities.ts (inlined: no lib-to-lib value import).
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED[body.toLowerCase()] ?? match;
  });
}

// Twin of postingText in lib/classify.ts, minus its 6,000-char cap (the
// sponsorship line usually sits in the legal boilerplate at the END of a
// posting) and plus a ". " at every block end (fold 2 A5), so a bullet never
// runs into the next one and a negation in one bullet never guards the next.
export function postingText(html: string): string {
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(?:li|p|div|h\d|tr)\s*>|<br\s*\/?>/gi, ". ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

// A sentence boundary is . ! ? ; followed by a space and a capital or digit
// (so "U.S. citizen" does not split), or a bullet / pipe separator.
const BOUNDARY = /[.!?;](?=\s+[A-Z0-9"(])|\s[•|]\s/g;
const CONTEXT = 300;

// The sentence holding a match (uncapped, for the hedge test) and the quote
// for the note (capped at QUOTE_MAX).
function sentenceAround(text: string, start: number, end: number): { sentence: string; quote: string } {
  const leftFrom = Math.max(0, start - CONTEXT);
  let left = leftFrom;
  // The slice runs one char past the match start so a boundary right before
  // the match can see its lookahead (". Must"); a boundary is kept only when
  // it ends at or before the match.
  for (const m of text.slice(leftFrom, start + 1).matchAll(BOUNDARY)) {
    const boundaryEnd = leftFrom + m.index + m[0].length;
    if (boundaryEnd <= start) left = boundaryEnd;
  }
  const rightText = text.slice(end, end + CONTEXT);
  const next = BOUNDARY.exec(rightText);
  BOUNDARY.lastIndex = 0;
  const right = next ? end + next.index : Math.min(text.length, end + CONTEXT);
  const sentence = text.slice(left, right).trim();
  // ponytail: a sentence longer than the cap keeps the part from the match onward.
  const quote = (sentence.length > QUOTE_MAX ? text.slice(start, start + QUOTE_MAX).trim() : sentence)
    .replace(/["“”]/g, "'")
    .replace(/[\s.,;:]+$/, "");
  return { sentence, quote };
}

export function gateNote(visa_class: VisaClass, matched: string): string {
  return `Posting says: "${matched}". ${NOTE_TAIL[visa_class]}`;
}

// Fold 2026-09-16 F1 + fold 2 A1/A2: a negated requirement ("does not require
// a clearance", "No clearance required", "doesn't require") is not a
// requirement. A match whose 24 preceding chars end in a whole negation word
// (up to two words back) is skipped. A pattern that starts AT the negation
// ("No visa sponsorship", "without sponsorship") has a clean window and still
// fires; "Northern", "Northrop", "none" are not negations.
const NEGATED_BEFORE = /(?:\bno|\bnot|\bwithout|\bnever|\bnor|n't)\b\s*(?:\w+\s+){0,2}$/i;
const NEGATION_WINDOW = 24;

// ponytail: each pattern is checked at its FIRST occurrence only; a text whose
// first occurrence is negated or hedged and whose second is a hard requirement
// reads as the first. Iterate occurrences if a real posting shows that.
export function gateFromText(html: string): GateResult {
  const text = postingText(html);
  let hedged: GateResult | null = null;
  for (const { visa_class, patterns } of TABLES) {
    if (visa_class === "question" && hedged) return hedged;
    for (const pattern of patterns) {
      const m = pattern.exec(text);
      if (!m) continue;
      if (NEGATED_BEFORE.test(text.slice(Math.max(0, m.index - NEGATION_WINDOW), m.index))) continue;
      const { sentence, quote } = sentenceAround(text, m.index, m.index + m[0].length);
      if (visa_class !== "question" && HEDGE.test(sentence)) {
        hedged ??= { visa_class: "question", note: gateNote("question", quote), matched: quote };
        continue;
      }
      return { visa_class, note: gateNote(visa_class, quote), matched: quote };
    }
  }
  return hedged ?? { visa_class: null, note: null, matched: null };
}
