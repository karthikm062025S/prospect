// v7 S4 (OD2). Builds public/brand/: the small set of thesvg brand marks whose
// slug we can match to a real Scout company with HIGH confidence, plus the
// lookup index the app reads.
//
// A wrong logo on a company row is worse than initials, so there is NO fuzzy
// matching here — a company only gets a mark when its normalized name is
// exactly a manifest title/alias/slug that resolves to ONE brand icon, or when
// its careers-page domain is exactly the manifest's brand domain. Everything
// else keeps the existing favicon -> initials chain in components/company-avatar.tsx.
//
// Run (from the repo root):
//   node scripts/brand-icons.mjs                     # names from targets.json + endpoints.json
//   node scripts/brand-icons.mjs --names live.json   # ...plus a [{name, link}] dump of the DB
//
// Writes: public/brand/<slug>.svg (the mono variant) and public/brand/index.json
// ({ normalizedName|domain: slug }). Prints the unmatched company list.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The icon pack lives outside the repo, in the workspace design folder.
// Resolve it relative to the repo root first (works for any clone sitting at
// <workspace>/my_projects/<repo>); the absolute path is the fallback only.
const WORKSPACE_PACK = path.resolve(rootDir, "../../design/icons/thesvg");
const PACK = existsSync(WORKSPACE_PACK) ? WORKSPACE_PACK : "C:/My_WorkSpace/design/icons/thesvg";
const OUT = path.join(rootDir, "public", "brand");

// Same host denylist as components/company-avatar.tsx: an ATS host is not the company.
const ATS =
  /greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|workable\.com|jobvite\.com|icims\.com/;

/**
 * Lowercase, drop diacritics and every non-alphanumeric.
 * `stripParens` (company display names only) also drops "(Optum)"-style qualifiers.
 * It must stay OFF for manifest titles: "Nvidia (Nemotron)" would otherwise
 * normalize onto plain "NVIDIA" and make the real NVIDIA mark look ambiguous.
 */
export function normalizeName(name, stripParens = true) {
  let text = String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (stripParens) text = text.replace(/\([^)]*\)/g, " ");
  return text.replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");
}

/** Registrable-ish host for a URL, or null for an ATS host / unparseable input. */
export function domainOf(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (ATS.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

// Names where the one manifest hit is provably a DIFFERENT company than the
// Scout company of that name (checked against the manifest's own brand URL).
// These keep the favicon -> initials chain.
const AMBIGUOUS = new Set([
  "stryker", // manifest "Stryker" = stryker-mutator.io (a JS mutation tester), not Stryker Corp
  "tekton", // manifest "Tekton" = the CD Foundation CI project, not the company
]);

// A mark whose art SPELLS the company name is a wordmark: rendered beside the
// company's own text label it prints the name twice ("intel Intel"), and at the
// 28px the row gives it the letters are a smear. `inkRatio` finds them
// automatically past MAX_INK_RATIO, and these two sets carry the cases the
// measurement gets wrong. Both were read off the rendered 28px contact sheet of
// all 185 marks, C:/My_WorkSpace/design/references/scout-s4-app/brand-wordmark-audit-sheet.png
// (regenerate it any time with `node scripts/brand-icons.mjs --review`).
//
// 2.0 is where the measured cliff is: every mark above it except these two is a
// name-strip, and the widest real symbols left below it (mastercard 1.62,
// nvidia 1.51, meta 1.51) sit well clear. A 1.4 cut was measured and REJECTED --
// it also takes meta, nvidia, mastercard, lyft, anthropic, discord and 14 other
// genuine symbols, which costs far more than the four wordmarks it adds.
const MAX_INK_RATIO = 2.0;
const SYMBOL_SLUGS = new Set(["nike", "cloudflare"]); // wide art, no letters
const WORDMARK_SLUGS = new Set(["aws", "box", "cisco", "sage"]); // letters, but not wide enough to measure as one

/**
 * An icon that cannot be a company at all. A programming language shares a name
 * with real companies (Apex, CSS), and an entry with no brand URL cannot be
 * checked against anything, so neither is trustworthy enough to put on a row.
 */
function isCompanyIcon(icon) {
  if (icon.collection !== "brands") return false; // AWS/Azure/GCP service icons are not companies
  if (!icon.url) return false;
  if ((icon.categories ?? []).includes("Language")) return false;
  return Boolean(icon.variants?.mono); // see the art gates in main()
}

/** width/height of an SVG's viewBox (falling back to its attributes), or null. */
export function aspectRatio(svg) {
  const head = svg.slice(0, 600);
  const box = head.match(/viewBox="[-\d.eE]+[ ,]+[-\d.eE]+[ ,]+([\d.eE]+)[ ,]+([\d.eE]+)"/);
  if (box) return Number(box[2]) > 0 ? Number(box[1]) / Number(box[2]) : null;
  const w = head.match(/\bwidth="([\d.]+)(?:px)?"/);
  const h = head.match(/\bheight="([\d.]+)(?:px)?"/);
  if (w && h && Number(h[1]) > 0) return Number(w[1]) / Number(h[1]);
  return null;
}

// One SVG path command -> its argument shape. `f` is an arc FLAG: exactly one
// '0' or '1' character, which an SVG minifier may pack straight against the
// next number ("a5 5 0 013 3"), so a plain number scan reads it as 013 and
// every later coordinate shifts. Reading flags positionally is what keeps 30
// of the 185 marks measurable (cisco, visa, nike, ebay, ...).
const PATH_ARGS = {
  M: ["n", "n"], L: ["n", "n"], H: ["n"], V: ["n"], T: ["n", "n"],
  C: ["n", "n", "n", "n", "n", "n"], S: ["n", "n", "n", "n"], Q: ["n", "n", "n", "n"],
  A: ["n", "n", "n", "f", "f", "n", "n"], Z: [],
};

const NUMBER = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/;

/** Read one command's arguments from `text` at `at`, or null if they are malformed. */
function readArgs(text, at, spec) {
  const values = [];
  let i = at;
  for (const kind of spec) {
    while (i < text.length && (text[i] === " " || text[i] === "," || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i += 1;
    if (kind === "f") {
      if (text[i] !== "0" && text[i] !== "1") return null;
      values.push(Number(text[i]));
      i += 1;
      continue;
    }
    const match = NUMBER.exec(text.slice(i));
    if (!match || match[0] === "" || match[0] === "-" || match[0] === "+") return null;
    values.push(Number(match[0]));
    i += match[0].length;
  }
  return { values, next: i };
}

/**
 * Bounding box of one path's `d`, walking absolute + relative commands.
 * Bezier CONTROL points are included, so the box is a superset of the true
 * outline -- deliberately conservative: this gate only ever REMOVES marks, and
 * over-measuring a shape can only keep one. Returns null on anything it cannot
 * parse, which the caller treats as "no opinion" (the mark is kept).
 */
export function pathBox(d) {
  let x = 0, y = 0, startX = 0, startY = 0, cmd = null, i = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const hit = (px, py) => {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
  const isSep = (ch) => ch === " " || ch === "," || ch === "\t" || ch === "\n" || ch === "\r";
  while (i < d.length) {
    if (isSep(d[i])) { i += 1; continue; }
    if (/[A-Za-z]/.test(d[i])) {
      cmd = d[i];
      i += 1;
      if (cmd === "Z" || cmd === "z") { x = startX; y = startY; continue; }
    }
    if (cmd === null) return null;
    const spec = PATH_ARGS[cmd.toUpperCase()];
    if (spec === undefined) return null;
    const read = readArgs(d, i, spec);
    if (!read) return null;
    i = read.next;
    const a = read.values;
    const rel = cmd === cmd.toLowerCase();
    const ax = (v) => (rel ? x + v : v);
    const ay = (v) => (rel ? y + v : v);
    switch (cmd.toUpperCase()) {
      case "M":
        x = ax(a[0]); y = ay(a[1]); startX = x; startY = y; hit(x, y);
        cmd = rel ? "l" : "L"; // an implicit repeat after M is a lineto
        break;
      case "L": case "T":
        x = ax(a[0]); y = ay(a[1]); hit(x, y);
        break;
      case "H":
        x = ax(a[0]); hit(x, y);
        break;
      case "V":
        y = ay(a[0]); hit(x, y);
        break;
      case "C":
        for (let k = 0; k < 6; k += 2) hit(ax(a[k]), ay(a[k + 1]));
        x = ax(a[4]); y = ay(a[5]);
        break;
      case "S": case "Q":
        for (let k = 0; k < 4; k += 2) hit(ax(a[k]), ay(a[k + 1]));
        x = ax(a[2]); y = ay(a[3]);
        break;
      case "A":
        // The endpoint only: an arc bulges at most by its radii, and both are
        // already smaller than the 24-unit box every mark is drawn in.
        x = ax(a[5]); y = ay(a[6]); hit(x, y);
        break;
    }
  }
  if (minX > maxX) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * width/height of the INK in an SVG (the union of its path boxes), or null.
 *
 * The viewBox is useless as a wordmark signal in this pack: every mono file is
 * `0 0 24 24`, so `aspectRatio` above reads 1.0 for the intel and amd marks
 * even though both draw the letters I-N-T-E-L and A-M-D across a 24-unit strip
 * (measured 2026-09-03: intel ink 2.58:1, amd 4.19:1). Rendered beside the
 * company's own name they print the name twice. The ink box is what the eye
 * actually sees, so that is what the wordmark gate measures.
 */
export function inkRatio(svg) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, seen = false;
  for (const match of svg.matchAll(/\sd="([^"]+)"/g)) {
    const box = pathBox(match[1]);
    if (!box) return null; // unparsed geometry -> no opinion
    seen = true;
    if (box.minX < minX) minX = box.minX;
    if (box.minY < minY) minY = box.minY;
    if (box.maxX > maxX) maxX = box.maxX;
    if (box.maxY > maxY) maxY = box.maxY;
  }
  // <rect>/<circle>/<g transform> art is not measured here; those files keep
  // their mark (3 of the 185 in the current pack).
  if (!seen || maxY - minY <= 0) return null;
  return (maxX - minX) / (maxY - minY);
}

/**
 * Build the exact-match tables from the thesvg manifest.
 * A key that resolves to more than one slug is dropped: ambiguous is a non-match.
 */
export function buildTables(icons) {
  const bySlug = new Map();
  const byTitle = new Map();
  const byAlias = new Map();
  const byDomain = new Map();
  const add = (map, key, slug) => {
    if (!key) return;
    const seen = map.get(key);
    if (seen === undefined) map.set(key, slug);
    else if (seen !== slug) map.set(key, null); // collision -> permanently ambiguous
  };
  for (const icon of icons) {
    if (!isCompanyIcon(icon)) continue;
    add(bySlug, normalizeName(icon.slug, false), icon.slug);
    add(byTitle, normalizeName(icon.title, false), icon.slug);
    for (const alias of icon.aliases ?? []) add(byAlias, normalizeName(alias, false), icon.slug);
    add(byDomain, domainOf(icon.url), icon.slug);
  }
  const tables = { bySlug, byTitle, byAlias, byDomain };
  for (const map of Object.values(tables)) {
    for (const [key, slug] of map) if (slug === null) map.delete(key);
  }
  return tables;
}

/**
 * One company -> slug, or null when nothing matches with high confidence.
 * Order: brand domain, then exact slug, then exact title, then exact alias — each
 * tier already dropped its own collisions, so a hit here is one unambiguous icon.
 * A company's careers link is NOT used as a veto: careers hosts legitimately live
 * off-brand (metacareers.com, amazon.jobs), so a mismatch proves nothing.
 */
export function lookup(tables, company) {
  const domain = domainOf(company.link);
  if (domain && tables.byDomain.has(domain)) return tables.byDomain.get(domain);
  const key = normalizeName(company.name);
  if (key.length < 2 || AMBIGUOUS.has(key)) return null;
  return tables.bySlug.get(key) ?? tables.byTitle.get(key) ?? tables.byAlias.get(key) ?? null;
}

function main() {
  const icons = JSON.parse(readFileSync(path.join(PACK, "src/data/icons.json"), "utf8"));
  const tables = buildTables(icons);
  const variantsBySlug = new Map();
  const urlBySlug = new Map();
  for (const icon of icons) {
    if (icon.collection !== "brands") continue;
    variantsBySlug.set(icon.slug, icon.variants ?? {});
    urlBySlug.set(icon.slug, icon.url ?? "");
  }

  // Company universe: the in-repo target/endpoint lists, plus an optional live dump.
  const targets = JSON.parse(readFileSync(path.join(rootDir, "scripts/targets.json"), "utf8"));
  const endpoints = JSON.parse(readFileSync(path.join(rootDir, "scripts/endpoints.json"), "utf8"));
  const companies = new Map(); // normalized name -> { name, link }
  const push = (name, link) => {
    const key = normalizeName(name);
    if (!key) return;
    const prev = companies.get(key);
    if (!prev) companies.set(key, { name, link: link ?? null });
    else if (!prev.link && link) prev.link = link;
  };
  for (const name of Object.keys(targets.companies ?? {})) push(name, null);
  for (const name of Object.keys(targets.aliases ?? {})) push(name, null);
  for (const row of endpoints) push(row.company, null);
  const namesFlag = process.argv.indexOf("--names");
  if (namesFlag !== -1) {
    for (const row of JSON.parse(readFileSync(process.argv[namesFlag + 1], "utf8"))) {
      if (typeof row === "string") push(row, null);
      else push(row.name, row.link ?? row.careers_url ?? null);
    }
  }

  // Two quality gates on the art itself, both "no mark beats a bad mark":
  //  - mono only. `default.svg` is brand-colour art and often sits on a full-bleed
  //    white plate (home-depot, kroger), which the app renders as a solid blob
  //    because the mark is drawn as a tinted CSS mask. 22 otherwise-matched slugs
  //    (Microsoft, OpenAI, LinkedIn, Adobe, Salesforce, ...) ship no mono and so
  //    stay on the favicon chain.
  //  - roughly square VIEWBOX. Kills the files drawn on a wide canvas: a
  //    wordmark like "ORACLE" (7.7:1) is a smear inside a 28px circle.
  //  - not a WORDMARK. The viewBox gate misses most of them, because in this
  //    pack a wordmark is usually drawn as a wide ink strip inside a square
  //    24x24 box (intel and amd both read 1.00 by viewBox, 2.58 and 4.19 by
  //    ink), and a mark that spells the name prints it twice on the row.
  const artCache = new Map(); // slug -> { svg } | null
  const rejected = []; // [slug, reason] for --review
  const artFor = (slug) => {
    if (artCache.has(slug)) return artCache.get(slug);
    const rel = (variantsBySlug.get(slug) ?? {}).mono;
    let art = null;
    if (rel) {
      const svg = readFileSync(path.join(PACK, "public", rel.replace(/^\//, "")), "utf8");
      const ratio = aspectRatio(svg);
      const ink = inkRatio(svg);
      if (ratio === null || ratio < 0.7 || ratio > 1.45) rejected.push([slug, "viewbox " + (ratio === null ? "n/a" : ratio.toFixed(2))]);
      else if (WORDMARK_SLUGS.has(slug)) rejected.push([slug, "wordmark (reviewed)"]);
      else if (ink !== null && ink > MAX_INK_RATIO && !SYMBOL_SLUGS.has(slug)) rejected.push([slug, "wordmark ink " + ink.toFixed(2)]);
      else art = { svg };
    }
    artCache.set(slug, art);
    return art;
  };

  const index = {};
  const matched = new Map(); // slug -> company name (first wins, for logging)
  const unmatched = [];
  for (const [key, company] of companies) {
    const slug = lookup(tables, company);
    if (!slug || !artFor(slug)) {
      unmatched.push(company.name);
      continue;
    }
    index[key] = slug;
    const domain = domainOf(company.link);
    if (domain) index[domain] = slug;
    if (!matched.has(slug)) matched.set(slug, company.name);
  }

  // Rebuild from scratch so a removed company's mark does not linger.
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  for (const slug of matched.keys()) writeFileSync(path.join(OUT, slug + ".svg"), artFor(slug).svg);
  writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index) + "\n");

  console.log("companies: " + companies.size);
  console.log("matched:   " + matched.size + " mono marks");
  console.log("index keys: " + Object.keys(index).length);
  console.log("unmatched: " + unmatched.length);
  console.log("rejected art: " + rejected.length);
  if (process.argv.includes("--review")) {
    for (const [slug, name] of [...matched].sort((a, b) => a[1].localeCompare(b[1]))) {
      console.log("  " + name + "  ->  " + slug + "  (" + urlBySlug.get(slug) + ")");
    }
    for (const [slug, reason] of [...rejected].sort()) console.log("  REJECTED " + slug + "  " + reason);
  }
  console.log(unmatched.sort((a, b) => a.localeCompare(b)).join(" | "));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
