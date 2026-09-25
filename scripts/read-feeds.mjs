// Deterministic public-list feed ingestion (Scout — ADDITIVE to scan.mjs).
//
// Fetches the public GitHub internship-list READMEs (SimplifyJobs Summer2026,
// vanshb03 Summer2027, speedyapply), parses the ROLE rows IN CODE (zero LLM
// tokens, $0 — same discipline as scan.mjs / read-alerts.mjs), reuses scan.mjs's
// title/US/wrong-term filters, tags giants/unicorns from targets.json (via
// read-alerts.mjs's normName + loadContext) so mandatory tailoring fires
// downstream, applies a small recency window so an hourly run posts a DELTA not
// the whole list, and POSTs survivors to the existing /api/watcher webhook
// (server-side dedup + applied-lock + skip_refresh — this file never changes it).
//
// It complements the other two feeds: scan.mjs sees only companies on public ATS
// APIs; read-alerts.mjs sees only companies that email a job alert. These curated
// community lists surface fresh roles (the aggregators' own ATS anchors) that
// neither of the others has yet — and they carry an Age/Date column so we can post
// only what's new. Companies already on a scanner ATS are skipped here (the
// scanner dates them; we'd null the date → a duplicate dedup bucket), so this
// focuses on the no-API gap, exactly like read-alerts.
//
// Env: WATCHER_SECRET + SCOUT_WEBHOOK (both required to POST — SCOUT_WEBHOOK has
// NO default; this is a hackathon repo and must never silently fall back to the
// old Scout production URL, 2026-09-19 16:45 fix).
// Flags: --dry-run (parse + print, no POST), --since-days N (recency window,
// default 2).
//
// Idempotency: the webhook's (company,title,posted_at) dedup is the TRUE backstop;
// posted_at is left null on purpose (see buildFeedRole) so the same role across
// hourly runs / repeated lists collapses to one row.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { looksUS } from "./scan.mjs";
import { isEligiblePosting, bucketWide } from "./scan-core.mjs";
import { normName, loadContext } from "./read-alerts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- args / env ----
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  const v = i >= 0 ? args[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : def;
};
const DRY_RUN = flag("dry-run");
// Guard a mistyped flag: NaN/0 window must not silently drop or flood.
const num = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};
const SINCE_DAYS = num(opt("since-days", "2"), 2);
// No default — a hackathon repo must never silently fall back to the old
// Scout production URL (2026-09-19 16:45 fix). Checked before any fetch, below.
const WEBHOOK = process.env.SCOUT_WEBHOOK || "";
const SECRET = process.env.WATCHER_SECRET || "";
const FETCH_TIMEOUT_MS = 30000;

// Public list READMEs. listName is the `feed:<name>` source tag + a fixture key.
// SimplifyJobs renders an HTML <table>; vanshb03 + speedyapply render a
// pipe-delimited markdown table — parseFeed auto-detects which.
//
// Coverage lane (2026-09-19), each verified live during this build
// (see the build handoff's VERIFIED SOURCES TABLE for URL/status/row-count):
// - simplify: Summer2026-Internships repo redirected (301) to
//   SimplifyJobs/Summer2027-Internships (dev branch, same HTML-table format,
//   1.18MB README, 200 live) — swapped in place, same listName so parseFeed's
//   HTML detection and every downstream test/fixture stay unchanged.
// - newgrad: SimplifyJobs/New-Grad-Positions (dev branch) — same publisher,
//   same HTML-table format (11,975 <td> tags, 200 live), auto-detected as HTML
//   by parseFeed's content-sniff (not "simplify"/"vanshb03"/"speedyapply" but
//   contains <td>).
// - vanshb03-newgrad: vanshb03/New-Grad-2027 (main branch) — 200 live,
//   VERIFIED identical 5-column pipe-markdown layout to the existing
//   vanshb03/Summer2027-Internships feed (Company | Role | Location |
//   Application/Link | Date Posted) — a real drop-in for the existing
//   parsePipeFeed path, no new parser needed. Its rows are titled "New Grad:
//   ..." / "New Grad 2027: ..." with NO intern/co-op wording, which is why
//   buildFeedRole below now gates on isEligiblePosting (wide), not the old
//   intern-only isTargetTitle — those titles would otherwise all drop.
const FEEDS = [
  { name: "simplify", url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README.md" },
  { name: "vanshb03", url: "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/main/README.md" },
  { name: "newgrad", url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md" },
  { name: "vanshb03-newgrad", url: "https://raw.githubusercontent.com/vanshb03/New-Grad-2027/main/README.md" },
  // note: a dedicated quant list (northwesternfintech/2027QuantInternships,
  // live-verified 200, main branch) was evaluated and NOT added — its README is
  // organized as one `## <Company>` heading per firm followed by a 2-column
  // (Role|Links) table, a fundamentally different shape from the 5-column
  // company/role/location/application/age layout every other feed here shares.
  // Teaching parsePipeFeed that shape (or writing a dedicated parser) for one
  // source is exactly the speedyapply situation below — same discipline: don't
  // ship an untested mis-parse. The two SimplifyJobs lists above already carry
  // quant + PM postings by name (their own repo descriptions say so) so quant/PM
  // coverage isn't zero without it. Upgrade path: a dedicated
  // parseCompanyHeadingFeed() + a passing extraction test, then add it here.
  // note: speedyapply is DISABLED. Its real README (verified 2026-07-13) is a
  // 6-column pipe table — `| Company | Position | Location | Salary | Posting | Age |`
  // — where the apply <a href> lives in the Posting column (index 4) and index 3 is a
  // Salary cell the generic 5-column parser (companyCell,roleCell,locCell,appCell,ageCell)
  // reads as the apply cell. Finding no href there, it drops EVERY row — so re-enabling
  // it as-is would ship nothing while looking healthy (proven by the "speedyapply … is
  // incompatible" test in tests/read-feeds.test.ts). Upgrade path: teach parsePipeFeed
  // the salary/variable-column layout and add a passing extraction test, THEN uncomment.
  // Never ship an untested mis-parse to the prod webhook.
  // { name: "speedyapply", url: "https://raw.githubusercontent.com/speedyapply/2026-SWE-College-Jobs/main/README.md" },
];

// ---------------------------------------------------------------------------
// Deterministic HTML/markdown helpers (no DOM, no network).
// ---------------------------------------------------------------------------
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#160": " " };
function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    const key = code.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    try {
      if (/^#x[0-9a-f]+$/i.test(code)) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (/^#\d+$/.test(code)) return String.fromCodePoint(parseInt(code.slice(1), 10));
    } catch {
      return m;
    }
    return m;
  });
}
function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// The company-name cell carries decorations we must strip to a bare name:
// 🔥 (hot), 🎓 (grad-friendly), markdown **bold** / `code`, and the ↳ repeat mark
// (handled by the caller as a carry-forward signal, never a name).
function cleanName(s) {
  return String(s || "")
    .replace(/[🔥🎓🔒]/gu, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const REPEAT = /↳/; // "same company as the row above" mark used by all three lists

// Role-title normalization — the SINGLE source of truth so the SAME posting yields
// the SAME title string every run. The webhook dedups on an exact `eq(title)`, so any
// casing / whitespace / entity drift between two runs would create a DUPLICATE row.
// This entity-decodes (via stripTags), strips list decorations (emoji, **bold**,
// `code`), collapses internal whitespace, and trims — but PRESERVES case (the stored
// title must read naturally; the dedup key lowercases separately). Both parse paths
// route titles through here so the HTML and pipe formats can never drift apart.
function normTitle(raw) {
  return cleanName(stripTags(raw));
}

// First anchor href in a cell that is NOT a simplify.jobs / imgur asset link — i.e.
// the real ATS/apply link (SimplifyJobs puts it first; the second anchor is its own
// simplify.jobs tracker). null when the cell has no real apply link (a 🔒 closed row).
function realApplyLink(cellHtml) {
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(cellHtml))) {
    const href = decodeEntities(m[1].trim());
    if (!/^https?:\/\//i.test(href)) continue;
    if (/simplify\.jobs/i.test(href)) continue;
    return href;
  }
  return null;
}

// Company name out of a company cell (HTML or markdown), or null to carry forward.
function parseCompanyCell(cell) {
  const raw = String(cell || "");
  if (!stripTags(raw) || REPEAT.test(raw)) return null; // ↳ / blank → previous company
  let m = raw.match(/\[([^\]]+)\]\([^)]*\)/); // markdown [Name](url)
  if (m) return cleanName(m[1]);
  m = raw.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i); // <a ...>Name</a>
  if (m) return cleanName(stripTags(m[1]));
  return cleanName(stripTags(raw));
}

// ---------------------------------------------------------------------------
// PURE. Raw README text + list name -> Candidate[] {company,title,link,location,age}.
// Auto-detects the two real formats (HTML <table> vs pipe markdown). Closed rows
// (🔒, no real apply link) are skipped — they're not an actionable new drop. A row
// with a ↳ company carries the previous row's company forward.
// ---------------------------------------------------------------------------
export function parseFeed(markdown, listName) {
  const text = String(markdown || "");
  // SimplifyJobs renders an HTML <table>; vanshb03 + speedyapply render pipe
  // markdown. An unrecognized list falls back to content-sniffing so a new source
  // still parses without a code change.
  const html =
    listName === "simplify" ||
    (listName !== "vanshb03" && listName !== "speedyapply" && /<td\b/i.test(text));
  return html ? parseHtmlFeed(text) : parsePipeFeed(text);
}

function parseHtmlFeed(text) {
  const out = [];
  let lastCompany = "";
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let row;
  while ((row = rowRe.exec(text))) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (cells.length < 5) continue; // header (<th>) rows and stray markup → skip
    const [companyCell, roleCell, locCell, appCell, ageCell] = cells;
    const parsedCompany = parseCompanyCell(companyCell); // parse once; null → carry forward
    const company = parsedCompany ?? lastCompany;
    if (parsedCompany) lastCompany = parsedCompany;
    const link = realApplyLink(appCell);
    if (!link) continue; // 🔒 closed / no apply link → not a fresh drop
    const title = normTitle(roleCell);
    if (!title) continue;
    out.push({ company, title, link, location: stripTags(locCell), age: stripTags(ageCell) });
  }
  return out;
}

function parsePipeFeed(text) {
  const out = [];
  let lastCompany = "";
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|[\s|:\-]+\|?$/.test(t)) continue; // separator row |---|---|
    const cells = t.replace(/^\|/, "").replace(/\|$/, "").split("|");
    if (cells.length < 5) continue;
    const [companyCell, roleCell, locCell, appCell, ageCell] = cells;
    const roleText = normTitle(roleCell);
    if (/company/i.test(companyCell) && /role/i.test(roleCell)) continue; // header row
    const parsedCompany = parseCompanyCell(companyCell); // parse once; null → carry forward
    const company = parsedCompany ?? lastCompany;
    if (parsedCompany) lastCompany = parsedCompany;
    const link = realApplyLink(appCell);
    if (!link) continue; // 🔒 closed / text-only → skip
    if (!roleText) continue;
    out.push({ company, title: roleText, link, location: stripTags(locCell), age: stripTags(ageCell) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Recency window. The lists carry either a relative age ("3d","1mo","2h") or an
// absolute month-day ("Jul 09"). Parse to days-ago; unparseable → keep (mirrors
// scan.mjs's withinWindow — recall-first, the webhook dedup is the real backstop).
// ---------------------------------------------------------------------------
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
export function parseAgeDays(age) {
  const s = String(age || "").trim().toLowerCase();
  if (!s) return null;
  let m;
  if ((m = s.match(/(\d+)\s*mo\b/))) return Number(m[1]) * 30;
  if ((m = s.match(/(\d+)\s*w\b/))) return Number(m[1]) * 7;
  if ((m = s.match(/(\d+)\s*d\b/))) return Number(m[1]);
  if ((m = s.match(/(\d+)\s*h\b/))) return Number(m[1]) / 24;
  if ((m = s.match(/(\d+)\s*y\b/))) return Number(m[1]) * 365;
  const md = s.match(/^([a-z]{3,})\.?\s+(\d{1,2})/); // "Jul 09" / "May 22"
  if (md) {
    const mon = MONTHS[md[1].slice(0, 3)];
    if (mon === undefined) return null;
    const day = Number(md[2]);
    const now = new Date();
    let d = Date.UTC(now.getUTCFullYear(), mon, day);
    // A future date means the list rolled over the new year — it was last year.
    if ((now.getTime() - d) / 86400000 < -1) d = Date.UTC(now.getUTCFullYear() - 1, mon, day);
    return (now.getTime() - d) / 86400000;
  }
  return null;
}
export function withinFeedWindow(age, sinceDays = SINCE_DAYS) {
  const days = parseAgeDays(age);
  if (days === null) return true; // unparseable → keep
  return days <= sinceDays;
}

// ---------------------------------------------------------------------------
// One Candidate -> a minimal webhook role, or null / {_skip}. MIRRORS
// read-alerts.mjs's buildAlertRole exactly — same title/US/normName/scanner-covered
// gates, same minimal no-demote payload — but the source tag is feed:<list> /
// feed-target:<list> (non-target vs giant/unicorn). It NEVER emits
// lifecycle/eligible/note/priority, so a re-post can't demote an LLM-verified or
// applied row (the webhook UPDATE path only clobbers what we send; the tag rides in
// watcher-owned `source`). posted_at:null keeps every hourly re-find one dedup row.
// ---------------------------------------------------------------------------
export function buildFeedRole(cand, listName, ctx) {
  const title = cand.title;
  // isEligiblePosting (wide: every function/level,
  // still drops explicit stale-year noise) replaces the old CS-intern-only
  // isTargetTitle — the new-grad lists (New-Grad-Positions, New-Grad-2027) have
  // titles like "New Grad: Software Engineer" with NO intern/co-op wording,
  // which isTargetTitle's term gate would have dropped outright. Strictly more
  // permissive than isTargetTitle (drops only WRONG_TERM), so every existing
  // fixture-derived assertion in tests/read-feeds.test.ts still holds.
  if (!isEligiblePosting(title)) return null; // wide title gate + wrong-term
  if (!looksUS(cand.location, null)) return null; // US filter (reused)
  const norm = normName(cand.company);
  if (!norm) return null;
  if (ctx.scannerCovered.has(norm)) return { _skip: "scanner-covered" }; // scanner owns it
  const target = ctx.targets.get(norm);
  const company = target ? target.canonical : cand.company; // canonicalize known names
  const tag = target ? "feed-target" : "feed"; // feed-target => mandatory tailoring
  return {
    company,
    title: title.trim(),
    role_type: bucketWide(title),
    posted_at: null, // dedup on (company,title) across hourly runs / repeated lists
    link: cand.link || null,
    source: `${tag}:${listName}`,
 location: cand.location || null, // D34: the aggregator's parsed location text
  };
}

// The cross-run identity of a role: normalized company + lowercased (already-trimmed)
// title. IDENTICAL to ingestFeeds's within-run dedup key so the persisted seen-set and
// the in-run dedup can never disagree. role.title is already normTitle-normalized.
export const roleKey = (role) => `${normName(role.company)}|${role.title.toLowerCase()}`;

// Transform parsed candidates -> deduped webhook roles. pairs = [{cand, listName}].
// Single source of truth for the ingest step; main() and the fixture tests both go
// through here. Applies the recency window first (stale), then the shared filters
// (dropped), then the scanner-covered skip, then dedups on normName+title within the
// run, then drops any role already POSTed in a prior run (seenKeys → alreadySeen) so an
// hourly re-find is neither re-POSTed nor re-notified. Returned `roles` are the fresh
// delta only — both the POST payload and the notify list are built from it.
export function ingestFeeds(pairs, ctx, sinceDays = SINCE_DAYS, seenKeys = new Set()) {
  const roles = [];
  const seen = new Set();
  let skippedScanner = 0;
  let dropped = 0;
  let stale = 0;
  let alreadySeen = 0;
  for (const { cand, listName } of pairs) {
    if (!withinFeedWindow(cand.age, sinceDays)) { stale++; continue; }
    const role = buildFeedRole(cand, listName, ctx);
    if (!role) { dropped++; continue; }
    if (role._skip) { skippedScanner++; continue; }
    const key = roleKey(role);
    if (seen.has(key)) continue; // duplicate within this run
    seen.add(key);
    if (seenKeys.has(key)) { alreadySeen++; continue; } // already sent in a prior run
    roles.push(role);
  }
  return { roles, skippedScanner, dropped, stale, alreadySeen };
}

// ---------------------------------------------------------------------------
// Live path (not exercised by unit tests, which cover the pure fns above).
// ---------------------------------------------------------------------------
const SEEN_PATH = join(__dirname, ".feed-seen.json");

// Cross-run idempotency store: the role keys we've already POSTed + notified,
// persisted as a JSON array that .github/workflows/read-feeds.yml caches (actions/cache
// rolling key) between hourly runs. A missing/corrupt file → empty set (never throws).
// note: a plain JSON array on the Actions cache, not a DB or KV store. If the cache
// is evicted/empty, the set resets and this run's roles re-notify ONCE — acceptable,
// because the webhook's (company,title) dedup still prevents a duplicate ROW; only the
// GitHub email repeats, not the data.
async function loadSeen() {
  try {
    const arr = JSON.parse(await readFile(SEEN_PATH, "utf8"));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
async function saveSeen(seen) {
  await writeFile(SEEN_PATH, JSON.stringify([...seen], null, 2));
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "text/plain, text/markdown, */*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  // Checked before any fetch (2026-09-19 16:45 fix): SCOUT_WEBHOOK has no
  // default, so a live run with it unset must fail loud, not silently target
  // nothing / the wrong app.
  if (!DRY_RUN && !WEBHOOK) {
    console.error("SCOUT_WEBHOOK is not set");
    process.exit(1);
  }
  if (!DRY_RUN && !SECRET) {
    await writeFile(join(__dirname, "last-feeds.json"), JSON.stringify([], null, 2));
    console.error("WATCHER_SECRET not set — cannot POST. Set it or use --dry-run.");
    process.exit(1);
  }
  const ctx = await loadContext();
  const seenKeys = await loadSeen(); // role keys already POSTed in a prior hourly run
  console.log(
    `read-feeds: ${FEEDS.length} lists · since-days=${SINCE_DAYS} · seen=${seenKeys.size} · ${DRY_RUN ? "DRY-RUN" : "LIVE"} → ${WEBHOOK}`,
  );

  const pairs = [];
  const failed = [];
  for (const feed of FEEDS) {
    try {
      const md = await fetchText(feed.url);
      const cands = parseFeed(md, feed.name);
      for (const cand of cands) pairs.push({ cand, listName: feed.name });
      console.log(`  list ok: ${feed.name} (${cands.length} role rows)`);
    } catch (err) {
      failed.push(`${feed.name} (${err.message})`);
      console.log(`  list fail: ${feed.name} (${err.message})`);
    }
  }

  const { roles, skippedScanner, dropped, stale, alreadySeen } = ingestFeeds(pairs, ctx, SINCE_DAYS, seenKeys);

  console.log(
    `parsed → roles ${roles.length} · dropped(filter) ${dropped} · stale(window) ${stale} · skipped(scanner-covered) ${skippedScanner} · already-seen ${alreadySeen}`,
  );
  if (failed.length) console.log(`failed lists (${failed.length}): ${failed.join(", ")}`);
  for (const r of roles) console.log(`  · ${r.company} — ${r.title} [${r.role_type}] ${r.source}`);

  if (DRY_RUN) {
    await writeFile(join(__dirname, "last-feeds.json"), JSON.stringify([], null, 2));
    console.log("\n--dry-run: not posting, not writing the seen-set.");
    return;
  }
  if (roles.length === 0) {
    await writeFile(join(__dirname, "last-feeds.json"), JSON.stringify([], null, 2));
    console.log("nothing to post."); // nothing new → seen-set unchanged, no write
    return;
  }

  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Watcher-Secret": SECRET },
    body: JSON.stringify({ roles }),
    signal: AbortSignal.timeout(30000),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error(`\nPOST failed HTTP ${res.status}: ${bodyText}`);
    process.exit(1);
  }
  const out = JSON.parse(bodyText);
  const r = out.roles || {};
  console.log(`\nPOST ok: inserted ${r.inserted} · updated ${r.updated} · skipped_applied ${r.skipped_applied} · errors ${(r.errors || []).length}`);

  // Notify layer: source last-feeds.json from the webhook's true "genuinely new"
  // set (inserted_roles) so an `updated` re-find never re-notifies. Falls back to
  // this run's fresh survivors (the old pre-POST behavior) when the webhook
  // hasn't shipped inserted_roles yet, so nothing breaks before that deploy.
  const insertedRoles = Array.isArray(out.roles?.inserted_roles) ? out.roles.inserted_roles : null;
  const notifySource = insertedRoles ?? roles;
  await writeFile(
    join(__dirname, "last-feeds.json"),
    JSON.stringify(
      notifySource.map((x) => ({
        company: x.company,
        title: x.title,
        role_type: x.role_type,
        link: x.link,
        target: String(x.source || "").startsWith("feed-target"),
      })),
      null,
      2,
    ),
  );

  if ((r.errors || []).length) {
    // Do NOT record the seen-set — leave the roles unseen so the next run retries
    // them (webhook dedup makes already-succeeded rows no-ops on retry).
    console.error(`${r.errors.length} role(s) errored server-side:\n${r.errors.join("\n")}`);
    process.exit(1);
  }

  // Only after a fully-successful POST: record the sent keys so the next hourly run
  // neither re-POSTs nor re-notifies them.
  for (const sent of roles) seenKeys.add(roleKey(sent));
  await saveSeen(seenKeys);
  console.log(`seen-set: ${seenKeys.size} keys recorded → ${SEEN_PATH}`);
}

// Run only as a script, NOT when imported by a test (which uses the pure exports).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("read-feeds failed:", err);
    process.exit(1);
  });
}
