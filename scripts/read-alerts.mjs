// Deterministic job-alert email ingestion (Scout — ADDITIVE to scan.mjs).
//
// Reads a dedicated Gmail label via IMAP + app-password, parses job-alert emails
// IN CODE (zero LLM tokens, $0, no Claude-session burn — same discipline as
// scan.mjs), reuses scan.mjs's title/US/wrong-term filters, tags giants/unicorns
// from targets.json so the mandatory-tailoring rule fires downstream, and POSTs
// survivors to the existing /api/watcher webhook (server-side dedup + applied-lock
// + skip_refresh — this file never changes the webhook).
//
// It exists because the 999-endpoint scanner only sees companies on public ATS
// APIs; Karthik's PRIMARY targets (Google, Amazon, Apple, Netflix, Citadel, Two
// Sigma, D.E. Shaw, ...) run no-API portals the scanner structurally can't reach.
// Those firms (or an aggregator on their behalf) DO send job-alert emails; this
// job turns those emails into app rows the ToS-safe way (we consume only the mail
// they choose to send — never scrape LinkedIn/Indeed/Handshake).
//
// Env: GMAIL_USER, GMAIL_APP_PASSWORD (IMAP login), WATCHER_SECRET + SCOUT_WEBHOOK
//   (both required to POST — SCOUT_WEBHOOK has NO default; this is a hackathon
//   repo and must never silently fall back to the old Scout production URL,
//   2026-09-19 16:45 fix). GMAIL_LABEL (default "job-alerts").
// Flags: --dry-run (parse + print, no POST, no \Seen), --limit N (cap emails).
//
// Idempotency: processed mail is marked with a custom IMAP KEYWORD (not \Seen) and
// each run fetches only mail WITHOUT that keyword. Gating on \Seen was a silent-miss
// hole — opening a digest in Gmail before the cron runs marks it read and it'd be
// skipped forever. The keyword is durable server-side (survives the ephemeral CI
// checkout, which persists no repo state) and independent of read-state. The
// webhook's (company,title,posted_at) dedup is still the TRUE no-duplicate backstop:
// worst case if Gmail ever drops the keyword is a harmless re-POST, never a miss.
// posted_at is left null on purpose (see buildAlertRole) so the same role across
// repeated digests collapses to one row.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { isTargetTitle, looksUS, bucket } from "./scan.mjs";

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
const LIMIT = Number(opt("limit", "0")) || 0; // 0 = no cap
const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || "";
const GMAIL_LABEL = process.env.GMAIL_LABEL || "job-alerts";
// The processed-marker keyword (see the Idempotency note above). A custom IMAP
// keyword Gmail persists server-side; fetching `unKeyword` gives exactly the mail
// this job hasn't ingested yet, regardless of whether Karthik has read it.
const PROCESSED_KEYWORD = "scoutprocessed";
// No default — a hackathon repo must never silently fall back to the old
// Scout production URL (2026-09-19 16:45 fix). Checked before any fetch, below.
const WEBHOOK = process.env.SCOUT_WEBHOOK || "";
const SECRET = process.env.WATCHER_SECRET || "";

// ---------------------------------------------------------------------------
// HTML → tokens (deterministic, no DOM/network). Alert emails are CSS-heavy but
// their job cards are just <a href>title</a> anchors with company/location text
// beside them; an ordered token stream is enough to pull them out per source.
// ---------------------------------------------------------------------------
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", bull: "•", "#39": "'", "#x27": "'", "#160": " " };
function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    const key = code.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    try {
      // An out-of-range numeric entity (e.g. &#9999999999;) throws in fromCodePoint —
      // catch it so one malformed entity can't abort parsing the whole email.
      if (/^#x[0-9a-f]+$/i.test(code)) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (/^#\d+$/.test(code)) return String.fromCodePoint(parseInt(code.slice(1), 10));
    } catch {
      return m;
    }
    return m;
  });
}
function stripTags(html) {
  return decodeEntities(
    String(html)
      .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}
// Ordered stream of {type:'a',href,text} and {type:'t',text}.
function tokenize(html) {
  const tokens = [];
  const re = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    const between = stripTags(html.slice(last, m.index));
    if (between) tokens.push({ type: "t", text: between });
    tokens.push({ type: "a", href: decodeEntities(m[1].trim()), text: stripTags(m[2]) });
    last = re.lastIndex;
  }
  const tail = stripTags(html.slice(last));
  if (tail) tokens.push({ type: "t", text: tail });
  return tokens;
}

// Non-job CTA / chrome anchor text we must never treat as a role title. Guarded by
// length so a real title that merely STARTS with one of these words ("Open Source
// Software Engineer Intern", "Search Infrastructure Intern") isn't dropped —
// isTargetTitle is the real gate, this is just a cheap early cut for button text.
const CTA = /^(view|see|apply|save|unsubscribe|manage|settings?|update|edit|feedback|turn off|see all|view all|see more|all jobs|jobs?|help|privacy)\b/i;
const isTitleText = (t) => !!t && t.length >= 3 && t.length <= 160 && !(CTA.test(t) && t.length <= 24);

// Only http(s) links survive (mirrors app's safeHttpUrl); unwrap a tracking
// wrapper that embeds the real URL in a query param — WITHOUT a network call.
function cleanLink(href) {
  if (!href) return null;
  let u = href.trim();
  const m = u.match(/[?&](?:url|q|targetUrl|destination|u)=([^&\s]+)/i);
  if (m) {
    try {
      const dec = decodeURIComponent(m[1]);
      if (/^https?:\/\//i.test(dec)) u = dec;
    } catch {
      /* keep original */
    }
  }
  return /^https?:\/\//i.test(u) ? u : null;
}

// Split "Company · Location" / "Company - Location" text that aggregators render
// beside a job title. Comma tails are NOT split — a bare "San Francisco, CA" would
// mis-split into company "San Francisco" (the direct extractor recombines its tail
// as location, and aggregators use middot/dash). Returns {company, location}.
function splitCompanyLocation(text) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return { company: "", location: "" };
  const m = t.split(/\s*[·•|]\s*|\s+[-–]\s+/); // middot/bullet/pipe or spaced dash
  if (m.length >= 2) return { company: m[0].trim(), location: m.slice(1).join(", ").trim() };
  return { company: t, location: "" };
}

// ---------------------------------------------------------------------------
// Per-source extractors: (html, text, mail) -> [{company,title,link,location}].
// Modeled on the real templates (research 2026-07-12): LinkedIn job links are
// linkedin.com/comm/jobs/view/{id}; Indeed are indeed.com/rc/clk?jk={key}. The
// title/company are best-effort from the card text — a card missing a title is
// skipped (malformed-skip), never fetched (zero-network rule). A fixture per
// source guards the shape; forward a real sample to harden.
// note: regex/token extraction, not a full HTML parser dep. If a template
// drifts, its fixture test fails loudly — upgrade that one extractor then.
// ---------------------------------------------------------------------------
function extractByAnchor(html, hrefRe, mkLink) {
  const tokens = tokenize(html);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type !== "a" || !hrefRe.test(tok.href)) continue;
    const title = tok.text.replace(/\s+/g, " ").trim();
    if (!isTitleText(title)) continue;
    // company/location = the next non-empty text token before the next anchor.
    let tail = "";
    for (let j = i + 1; j < tokens.length && tokens[j].type === "t"; j++) {
      if (tokens[j].text) { tail = tokens[j].text; break; }
    }
    const { company, location } = splitCompanyLocation(tail);
    out.push({ company, title, location, link: mkLink(tok.href) });
  }
  return out;
}

const EXTRACTORS = {
  linkedin: (html) =>
    extractByAnchor(html, /linkedin\.com\/(comm\/)?jobs\/view\//i, (href) => {
      const id = href.match(/jobs\/view\/(\d+)/);
      return id ? `https://www.linkedin.com/jobs/view/${id[1]}` : cleanLink(href);
    }),
  indeed: (html) =>
    extractByAnchor(html, /indeed\.com\/(rc\/clk|pagead|viewjob)/i, (href) => {
      const jk = href.match(/[?&]jk=([^&]+)/i);
      return jk ? `https://www.indeed.com/viewjob?jk=${jk[1]}` : cleanLink(href);
    }),
  handshake: (html) =>
    extractByAnchor(html, /joinhandshake\.com\/(jobs|stu\/postings|emails\/click)/i, (href) => cleanLink(href)),
  // Google Careers / Greenhouse / Workday / any direct company board. Company is
  // the sender (the email is FROM the employer); title is the job-link anchor and
  // the text beside it is the location, so recombine the split tail as location.
  direct: (html, _text, mail) => {
    const sender = senderCompany(mail);
    return extractByAnchor(
      html,
      /(greenhouse\.io|myworkdayjobs\.com|lever\.co|ashbyhq\.com|smartrecruiters\.com|careers?\.|jobs?\.|\/careers|\/jobs)/i,
      (href) => cleanLink(href),
    ).map((r) => ({
      company: sender || r.company,
      title: r.title,
      location: [r.company, r.location].filter(Boolean).join(", "),
      link: r.link,
    }));
  },
};

// Derive an employer name from the From header ("Google Careers" -> "Google").
function senderCompany(mail) {
  const name = mail?.from?.value?.[0]?.name || "";
  if (name) {
    return name
      .replace(/\b(careers?|jobs?|talent|recruit(ing|ment)?|hiring|hr|team|notifications?|no[- ]?reply)\b/gi, "")
      .replace(/[|<>].*$/, "")
      .replace(/\s+/g, " ")
      .trim() || name.trim();
  }
  const addr = mail?.from?.value?.[0]?.address || "";
  const dom = addr.split("@")[1] || "";
  const base = dom.split(".").filter((p) => !/^(www|mail|email|careers?|jobs?|notifications?|e|em|smtp|mailer)$/i.test(p))[0];
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "";
}

// Which aggregator/source an email is from, by sender address.
export function detectSource(fromAddress) {
  const a = (fromAddress || "").toLowerCase();
  if (a.includes("linkedin.com")) return "linkedin";
  if (a.includes("indeed.com")) return "indeed";
  if (a.includes("joinhandshake.com")) return "handshake";
  return "direct";
}

// PURE. Raw RFC822 + source name -> Candidate[] {company,title,link,location,posted_hint}.
export async function parseAlertEmail(raw, source) {
  const mail = await simpleParser(raw);
  const html = mail.html || mail.textAsHtml || "";
  const text = mail.text || "";
  const extract = EXTRACTORS[source] || EXTRACTORS.direct;
  const rows = extract(html, text, mail) || [];
  const posted_hint = mail.date ? new Date(mail.date).toISOString() : null;
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const title = (r.title || "").replace(/\s+/g, " ").trim();
    if (!title) continue; // malformed card → skip
    const company = (r.company || "").replace(/\s+/g, " ").trim();
    const key = `${company.toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ company, title, link: cleanLink(r.link), location: (r.location || "").trim(), posted_hint });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tagging + filtering. normName collapses punctuation, legal suffixes, "&", AND
// parenthetical decorations, so "D.E. Shaw"/"D. E. Shaw", "Google LLC"/"Google",
// and "Susquehanna (SIG)"/"Susquehanna" all resolve. Variants it can't derive
// mechanically (JPMorgan↔JPMorgan Chase, Walmart↔Walmart Global Tech) come from
// the explicit `aliases` map in targets.json. It does NOT strip
// group/holdings/securities — those are meaningful ("Citadel" vs "Citadel
// Securities" are different firms; collapsing them mis-canonicalizes).
// ---------------------------------------------------------------------------
export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop "(SIG)"/"(Optum)"/"(Evernorth)" decorations
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|corp|corporation|ltd|plc|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Load once: targets (normName key -> {canonical, tier}) + scanner-covered set.
// Multiple keys can point at one target so an alert's plainer name still resolves:
//   (1) the full DB name, (2) any parenthetical CONTENT ("SIG"/"Optum"/"Anysphere"),
//   (3) explicit display aliases. Full names are added first so they win collisions.
export async function loadContext() {
  const raw = JSON.parse(await readFile(join(__dirname, "targets.json"), "utf8"));
  const targets = new Map();
  const add = (key, canonical, tier) => {
    const k = normName(key);
    if (k && !targets.has(k)) targets.set(k, { canonical, tier });
  };
  const companies = raw.companies || {};
  for (const [name, tier] of Object.entries(companies)) add(name, name, tier); // pass 1: full names
  for (const [name, tier] of Object.entries(companies)) {
    const paren = name.match(/\(([^)]+)\)/);
    if (paren) add(paren[1], name, tier); // pass 2: parenthetical content
  }
  for (const [alias, canonical] of Object.entries(raw.aliases || {})) {
    const tier = companies[canonical];
    if (tier) add(alias, canonical, tier); // pass 3: explicit display aliases
  }
  let scannerCovered = new Set();
  try {
    const eps = JSON.parse(await readFile(join(__dirname, "endpoints.json"), "utf8"));
    scannerCovered = new Set(eps.map((e) => normName(e.company)));
  } catch {
    /* endpoints.json optional for tests */
  }
  return { targets, scannerCovered };
}

// One Candidate -> a minimal webhook role, or null if it must be dropped.
// Minimal payload (company,title,role_type,posted_at,link,source) — never
// lifecycle/eligible/note/priority — so a re-ingest can't demote an LLM-verified
// or applied role (the webhook UPDATE path only clobbers what we send). The
// giants/unicorns tag rides in `source` (watcher-owned, safe to overwrite),
// keeping the payload minimal while still firing mandatory tailoring downstream.
// The AUTHORITATIVE mandatory-tailoring signal is targets.json membership checked
// at apply time — it covers every target regardless of source; the
// `alert-target:` source prefix is a convenience marker for the notify + no-API
// alert roles. note: an alert re-ingest of an LLM-advanced (non-applied) role
// still takes the webhook UPDATE path (skip_refresh is scanner-only) and can churn
// role_type/link/posted_at — verification (lifecycle/eligible/notes) is never
// demoted. Extending skip_refresh to `alert*` sources would fully stop the churn
// but edits the webhook lib (out of scope here); revisit if churn shows up live.
export function buildAlertRole(cand, source, ctx) {
  const title = cand.title;
  if (!isTargetTitle(title)) return null; // title role-gate + wrong-term (reused)
  if (!looksUS(cand.location, null)) return null; // US filter (reused)
  const norm = normName(cand.company);
  if (!norm) return null;
  // The scanner owns companies with a public ATS API; skip them here so the same
  // role isn't ingested twice (scanner dates it, we null it → different dedup
  // keys → a duplicate row). This focuses alerts on the no-API gap they exist for.
  if (ctx.scannerCovered.has(norm)) return { _skip: "scanner-covered" };
  const target = ctx.targets.get(norm);
  const company = target ? target.canonical : cand.company; // canonicalize known names
  const tag = target ? "alert-target" : "alert"; // alert-target => mandatory tailoring
  return {
    company,
    title: title.trim(),
    role_type: bucket(title),
    posted_at: null, // dedup on (company,title) across repeated digests
    link: cand.link || null,
    source: `${tag}:${source}`,
    location: cand.location || null, // the parsed location text, when present
  };
}

// Transform parsed candidates -> deduped webhook roles. pairs = [{cand, source}].
// The single source of truth for the ingest step; main() and the fixture tests
// both go through here (dedup on normalized company + title, across all emails).
export function ingestCandidates(pairs, ctx) {
  const roles = [];
  const seen = new Set();
  let skippedScanner = 0;
  let dropped = 0;
  for (const { cand, source } of pairs) {
    const role = buildAlertRole(cand, source, ctx);
    if (!role) { dropped++; continue; }
    if (role._skip) { skippedScanner++; continue; }
    const key = `${normName(role.company)}|${role.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    roles.push(role);
  }
  return { roles, skippedScanner, dropped };
}

// ---------------------------------------------------------------------------
// IMAP read (live path — not exercised by unit tests, which cover the pure fns).
// ---------------------------------------------------------------------------
function makeClient() {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    logger: false,
  });
}

async function fetchUnprocessed(client) {
  const messages = [];
  const lock = await client.getMailboxLock(GMAIL_LABEL);
  try {
    for await (const msg of client.fetch({ unKeyword: PROCESSED_KEYWORD }, { uid: true, source: true, envelope: true })) {
      messages.push({
        uid: msg.uid,
        raw: msg.source, // Buffer of RFC822
        from: msg.envelope?.from?.[0]?.address || "",
        subject: msg.envelope?.subject || "",
      });
      if (LIMIT && messages.length >= LIMIT) break;
    }
  } finally {
    lock.release();
  }
  return messages;
}

async function markProcessed(client, uids) {
  if (!uids.length) return;
  const lock = await client.getMailboxLock(GMAIL_LABEL);
  try {
    // The keyword is the real dedup marker; \Seen rides along only to keep the
    // label visually tidy (read-state no longer gates ingestion).
    await client.messageFlagsAdd(uids, [PROCESSED_KEYWORD, "\\Seen"], { uid: true });
  } finally {
    lock.release();
  }
}

async function runAlertsLane() {
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD not set — cannot read the label.");
    process.exit(1);
  }
  // Checked before any fetch (2026-09-19 16:45 fix): SCOUT_WEBHOOK has no
  // default, so a live run with it unset must fail loud, not silently target
  // nothing / the wrong app.
  if (!DRY_RUN && !WEBHOOK) {
    console.error("SCOUT_WEBHOOK is not set");
    process.exit(1);
  }
  if (!DRY_RUN && !SECRET) {
    await writeFile(join(__dirname, "last-alerts.json"), JSON.stringify([], null, 2));
    console.error("WATCHER_SECRET not set — cannot POST. Set it or use --dry-run.");
    process.exit(1);
  }

  const ctx = await loadContext();
  const client = makeClient();
  await client.connect();
  const processedUids = [];

  try {
    const messages = await fetchUnprocessed(client);
    console.log(`read-alerts: ${messages.length} unprocessed in "${GMAIL_LABEL}" · ${DRY_RUN ? "DRY-RUN" : "LIVE"} → ${WEBHOOK}`);

    const pairs = [];
    for (const msg of messages) {
      const source = detectSource(msg.from);
      let candidates = [];
      try {
        candidates = await parseAlertEmail(msg.raw, source);
      } catch (err) {
        // Leave a throwing email UNSEEN so a transient parse issue retries — never
        // lose a real alert. Throws are rare (entity/MIME edge cases); a permanently
        // bad email just re-logs each run, which is harmless noise.
        console.log(`  ! parse failed [${source}] "${msg.subject}": ${err.message} — left unread for retry`);
        continue;
      }
      for (const cand of candidates) pairs.push({ cand, source });
      processedUids.push(msg.uid);
    }
    const { roles, skippedScanner, dropped } = ingestCandidates(pairs, ctx);

    console.log(`parsed → roles ${roles.length} · dropped(filter) ${dropped} · skipped(scanner-covered) ${skippedScanner}`);
    for (const r of roles) console.log(`  · ${r.company} — ${r.title} [${r.role_type}] ${r.source}`);

    if (DRY_RUN) {
      await writeFile(join(__dirname, "last-alerts.json"), JSON.stringify([], null, 2));
      console.log("\n--dry-run: not posting, not marking \\Seen.");
      return;
    }
    if (roles.length === 0) {
      await writeFile(join(__dirname, "last-alerts.json"), JSON.stringify([], null, 2));
      // Still mark processed so empty/noise emails (e.g. alert-created confirmations) don't re-process each run.
      await markProcessed(client, processedUids);
      console.log("nothing to post.");
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
      // Do NOT mark seen — let the next run retry (webhook dedup makes it safe).
      console.error(`\nPOST failed HTTP ${res.status}: ${bodyText}`);
      process.exit(1);
    }
    const out = JSON.parse(bodyText);
    const r = out.roles || {};
    console.log(`\nPOST ok: inserted ${r.inserted} · updated ${r.updated} · skipped_applied ${r.skipped_applied} · errors ${(r.errors || []).length}`);

    // Notify layer: source last-alerts.json from the webhook's true "genuinely
    // new" set (inserted_roles) so an `updated` re-find never re-notifies. Falls
    // back to this run's survivors (the old pre-POST behavior) when the webhook
    // hasn't shipped inserted_roles yet, so nothing breaks before that deploy.
    const insertedRoles = Array.isArray(out.roles?.inserted_roles) ? out.roles.inserted_roles : null;
    const notifySource = insertedRoles ?? roles;
    await writeFile(
      join(__dirname, "last-alerts.json"),
      JSON.stringify(
        notifySource.map((x) => ({
          company: x.company,
          title: x.title,
          role_type: x.role_type,
          link: x.link,
          target: String(x.source || "").startsWith("alert-target"),
        })),
        null,
        2,
      ),
    );

    if ((r.errors || []).length) {
      // The webhook returns HTTP 200 even when individual rows error server-side.
      // Do NOT mark \Seen — leave the mail unseen so the next run retries the failed
      // rows (webhook dedup makes the already-succeeded rows no-ops on retry).
      console.error(`${r.errors.length} role(s) errored server-side:\n${r.errors.join("\n")}\nnot marking \\Seen — will retry next run.`);
      process.exit(1);
    }

    // Only after a fully-successful POST: mark processed mail (keyword) — the idempotency mark.
    await markProcessed(client, processedUids);
  } finally {
    await client.logout().catch(() => {});
  }
}

// Run only as a script, NOT when imported by a test (which uses the pure exports).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAlertsLane().catch((err) => {
    console.error("read-alerts failed:", err);
    process.exit(1);
  });
}
