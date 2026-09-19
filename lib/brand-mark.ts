// v7 S4 (OD2). Company name/domain -> the vendored brand mark under public/brand/,
// built by scripts/brand-icons.mjs from the thesvg pack. Only high-confidence
// matches are in the index, so a miss here is normal and falls through to the
// favicon -> initials chain in components/company-avatar.tsx.
//
// The marks are trademarks of their owners and appear only to identify the
// company on its own row (thesvg TRADEMARK.md: identification use, not endorsement).
import index from "../public/brand/index.json" with { type: "json" };

const BRAND_INDEX: Record<string, string> = index;

/**
 * Must stay identical to normalizeName(name, true) in scripts/brand-icons.mjs —
 * the script writes the index keys, this reads them.
 * tests/brand-mark.test.ts asserts the two agree.
 */
export function normalizeCompanyName(name: string): string {
  return String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "");
}

/** Public path of the company's mark, or null when there is no confident match. */
export function brandMarkSrc(name: string, domain?: string | null): string | null {
  const slug = BRAND_INDEX[normalizeCompanyName(name)] ?? (domain ? BRAND_INDEX[domain] : undefined);
  return slug ? `/brand/${slug}.svg` : null;
}
