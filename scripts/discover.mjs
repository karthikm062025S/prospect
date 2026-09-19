// ATS-token discovery (Scout coverage expansion).
//
// Harvests ATS tokens from PUBLIC internship lists (SimplifyJobs, vanshb03,
// speedyapply) + the app's own watch-target names, curl-verifies each resolves
// to a real board, and writes the verified NEW endpoints to
// scripts/endpoints.discovered.json. ToS-safe: only public GitHub lists and
// public ATS APIs — never LinkedIn/Indeed/Jobright.
//
// Token discipline: fetches multi-MB lists and parses them HERE, printing only
// counts — the raw lists never enter an LLM context.
//
// Usage:
//   node scripts/discover.mjs            # discover + verify → endpoints.discovered.json
//   node scripts/discover.mjs --merge    # then merge discovered into endpoints.json
//   node scripts/discover.mjs --limit N  # cap tokens verified (debug)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const optNum = (f, d) => {
  const i = args.indexOf(`--${f}`);
  const n = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : d;
};
const LIMIT = optNum("limit", Infinity);
const VERIFY_CONCURRENCY = 12;
const TIMEOUT_MS = 12000;

// Public list sources (raw text; regex-scanned, not schema-parsed).
const SOURCES = [
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
  "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/main/.github/scripts/listings.json",
  "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/main/README.md",
  "https://raw.githubusercontent.com/speedyapply/2026-SWE-College-Jobs/main/README.md",
];

// Repos whose OPEN ISSUES we also scan — new postings often sit in an issue
// (community submission) before a maintainer merges them into the list, so the
// issue carries an ATS link the README doesn't have yet.
const ISSUE_REPOS = [
  "SimplifyJobs/Summer2026-Internships",
  "vanshb03/Summer2027-Internships",
  "speedyapply/2026-SWE-College-Jobs",
];
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
const MAX_ISSUE_PAGES = 5; // 100/page → up to 500 open issues/repo

// Pull open-issue title+body text for a repo (auth'd if a token is present:
// 5000/hr vs 60/hr). Skips PRs. Returns "" on any failure — discovery degrades,
// never aborts.
async function fetchIssuesText(repo) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "scout-discover", // GitHub API 403s without a UA
    "x-github-api-version": "2022-11-28",
  };
  if (GH_TOKEN) headers.authorization = `Bearer ${GH_TOKEN}`;
  let text = "";
  let issues = 0;
  for (let page = 1; page <= MAX_ISSUE_PAGES; page++) {
    const url = `https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}`;
    let batch;
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (!res.ok) break;
      batch = await res.json();
    } catch {
      break;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const it of batch) {
      if (it.pull_request) continue; // the /issues API also lists PRs
      text += "\n" + (it.title || "") + "\n" + (it.body || "");
      issues++;
    }
    if (batch.length < 100) break;
  }
  return { text, issues };
}

// Segments that are never a company token.
const STOP = new Set([
  "embed", "job_board", "v1", "boards", "api", "jobs", "postings", "o", "p",
  "en-us", "en", "careers", "career", "company", "companies", "job", "search",
  "list", "for", "www", "posting-api", "job-board",
]);

const clean = (t) =>
  (t || "")
    .split(/[?#]/)[0]
    .replace(/\.json$/i, "")
    .replace(/\/+$/, "")
    .trim()
    .toLowerCase();

const okToken = (t) =>
  t && t.length >= 2 && /^[a-z0-9][a-z0-9._-]*$/.test(t) && !STOP.has(t);

// Extract {ats, token} pairs from a blob of text.
function extract(text) {
  const found = [];
  const push = (ats, raw) => {
    const token = clean(raw);
    if (okToken(token)) found.push({ ats, token });
  };
  let m;
  // Greenhouse: boards / job-boards / boards-api / embed?for=
  const gh =
    /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?(?:[^"'\s]*&)?for=)?([a-z0-9._-]+)|boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9._-]+)|greenhouse\.io\/embed\/job_board\?(?:[^"'\s]*&)?for=([a-z0-9._-]+)/gi;
  while ((m = gh.exec(text))) push("greenhouse", m[1] || m[2] || m[3]);
  // Lever
  const lv = /jobs\.lever\.co\/([a-z0-9._-]+)/gi;
  while ((m = lv.exec(text))) push("lever", m[1]);
  // Ashby (jobs.ashbyhq.com/{token}; skip api.ashbyhq.com)
  const ab = /jobs\.ashbyhq\.com\/([a-z0-9._-]+)/gi;
  while ((m = ab.exec(text))) push("ashby", m[1]);
  // SmartRecruiters
  const sr = /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9._-]+)/gi;
  while ((m = sr.exec(text))) push("smartrecruiters", m[1]);
  return found;
}

// Verify a candidate resolves to a real board (200 + parseable shape).
function verifyUrl(ats, token) {
  switch (ats) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=false`;
    case "lever":
      return `https://api.lever.co/v0/postings/${token}?mode=json&limit=1`;
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=1`;
    default:
      return null;
  }
}
function validShape(ats, data) {
  if (ats === "greenhouse") return Array.isArray(data?.jobs);
  if (ats === "ashby") return Array.isArray(data?.jobs);
  if (ats === "lever") return Array.isArray(data);
  if (ats === "smartrecruiters") return Array.isArray(data?.content);
  return false;
}

async function verify(ats, token) {
  const url = verifyUrl(ats, token);
  if (!url) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return false;
    const data = await res.json();
    return validShape(ats, data);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, limit, worker) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    }),
  );
  return out;
}

// Title-case a token into a readable company name (best-effort; the token is
// the source of truth for the scanner, the name is display only).
const nameFor = (token) =>
  token.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

async function main() {
  const existing = JSON.parse(await readFile(join(__dirname, "endpoints.json"), "utf8"));
  const existingKeys = new Set(existing.map((e) => `${e.ats}:${e.token}`));

  // 1. Fetch + extract.
  let raw = 0;
  const cand = new Map(); // ats:token -> {ats, token}
  for (const src of SOURCES) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) {
        console.log(`  source ${res.status}: ${src.split("/").slice(3, 5).join("/")}`);
        continue;
      }
      const text = await res.text();
      const hits = extract(text);
      raw += hits.length;
      for (const h of hits) {
        const key = `${h.ats}:${h.token}`;
        if (!existingKeys.has(key)) cand.set(key, h);
      }
      console.log(`  source ok: ${src.split("/").slice(3, 5).join("/")} (${hits.length} links)`);
    } catch (e) {
      console.log(`  source fail: ${src} (${e.message})`);
    }
  }

  // 1b. Scan open issues for links not yet merged into the lists.
  if (!GH_TOKEN) console.log("  (no GH_TOKEN — issue scan unauth'd, 60/hr limit)");
  for (const repo of ISSUE_REPOS) {
    const { text, issues } = await fetchIssuesText(repo);
    const hits = extract(text);
    raw += hits.length;
    let fresh = 0;
    for (const h of hits) {
      const key = `${h.ats}:${h.token}`;
      if (!existingKeys.has(key) && !cand.has(key)) fresh++;
      if (!existingKeys.has(key)) cand.set(key, h);
    }
    console.log(`  issues ok: ${repo} (${issues} open issues, ${hits.length} links, ${fresh} new)`);
  }

  let candidates = [...cand.values()];
  if (candidates.length > LIMIT) candidates = candidates.slice(0, LIMIT);
  const byAts = candidates.reduce((a, c) => ((a[c.ats] = (a[c.ats] || 0) + 1), a), {});
  console.log(
    `\nextracted ${raw} links · ${candidates.length} unique NEW candidates ${JSON.stringify(byAts)}`,
  );

  // 2. Verify.
  console.log(`verifying ${candidates.length} at concurrency ${VERIFY_CONCURRENCY}…`);
  const flags = await pool(candidates, VERIFY_CONCURRENCY, (c) => verify(c.ats, c.token));
  const verified = candidates.filter((_, i) => flags[i]);
  const vByAts = verified.reduce((a, c) => ((a[c.ats] = (a[c.ats] || 0) + 1), a), {});

  // 3. Write discovered (verified new endpoints only).
  const out = verified
    .map((c) => ({ company: nameFor(c.token), ats: c.ats, token: c.token }))
    .sort((a, b) => a.company.localeCompare(b.company));
  await writeFile(join(__dirname, "endpoints.discovered.json"), JSON.stringify(out, null, 2) + "\n");

  console.log(`\nVERIFIED LIVE: ${verified.length} ${JSON.stringify(vByAts)}`);
  console.log(`existing ${existing.length} → would total ${existing.length + verified.length}`);
  console.log(`wrote scripts/endpoints.discovered.json`);

  // 4. Optional merge.
  if (has("merge")) {
    const merged = [...existing];
    const keys = new Set(existingKeys);
    for (const e of out) {
      const k = `${e.ats}:${e.token}`;
      if (!keys.has(k)) {
        keys.add(k);
        merged.push(e);
      }
    }
    await writeFile(join(__dirname, "endpoints.json"), JSON.stringify(merged, null, 2) + "\n");
    console.log(`MERGED → endpoints.json now ${merged.length} endpoints`);
  } else {
    console.log(`(re-run with --merge to fold these into endpoints.json)`);
  }
}

main().catch((e) => {
  console.error("discover failed:", e);
  process.exit(1);
});
