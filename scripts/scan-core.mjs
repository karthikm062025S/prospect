// Scout scan core (RB-082 v2, slice 6c): the endpoint-fetch + filter body of
// scripts/scan.mjs, moved here VERBATIM so two callers run the same code —
// the GitHub Actions CLI (scripts/scan.mjs, the safety net) and the Vercel fast
// lane (app/api/scan/route.ts, called by pg_cron). No top-level side effects,
// no process.argv, `node:` built-ins only, so Next's server bundle can import it.
//
// scanEndpoints(endpoints, { sinceDays, concurrency, fetch }) →
//   { roles, okCount, failed, rawCounts }
// `roles` is the exact minimal-payload array the CLI POSTs to /api/watcher
// (title-gated, recency-windowed, US-filtered, per-run deduped, multi-location
// collapsed, endpoint order); the other three feed the CLI's health floor and
// canary. `fetch` is injected so tests can drive it without the network.

const FETCH_TIMEOUT_MS = 20000;
// Enterprise portals (Oracle/Phenom/Amazon) block non-browser user-agents; the
// simple JSON ATSs don't care, so a browser UA is safe everywhere.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
// Stable per-endpoint identity (dedup within a run + canary across runs). Oracle
// pods are multi-tenant (one host, many `site`s) so host alone can collide — key
// on host+site. Amazon has no token/tenant/host, so fall back to company.
export const epKey = (ep) =>
  ep.ats === "oracle"
    ? `oracle:${ep.host}:${ep.site}`
    : ep.ats === "successfactors"
      ? `successfactors:${ep.host}:${ep.companyId}` // one SF host serves many companyIds — key on both
      : `${ep.ats}:${ep.token || ep.tenant || ep.host || ep.company}`;

// ---- deterministic filters ----
// Word-boundary \bintern... (NOT "Internal"/"International"). Covers "Intern",
// "Interns", "Internship", "Internships" (the plural program titles quant firms
// use — "Software Engineering Internships").
// The INTERNSHIP-TERM gate. Widened 2026-09-03 (v7/feed lane): MISSION v7 D8 and
// Karthik's ingest decision admit co-op terms, but the gate still required the
// literal word "intern", so "Software Engineering Co-op 2027" and
// "2027 Summer Technology Analyst" were dropped at ingest (verified against the
// live feed: not one co-op-titled row without "intern" had ever been ingested).
// "summer analyst/associate/scholar" are the term-of-art internship titles used
// by finance/consulting technology programs. A CS signal is still REQUIRED
// separately (INCLUDE below), so a bare "Co-op 2027" or "2027 Summer Analyst"
// still drops.
const INTERN = /\bintern(ships?|s)?\b|\bco-?op\b|\bcooperative education\b|\bsummer\b(?:\s+[\w&/'-]+){0,3}\s+(analysts?|associates?|scholars?)\b/i;

// STRONG unambiguous CS-engineering signal. A title matching this is KEPT even
// when it also carries a non-technical DEPARTMENT word (e.g. "Marketing Software
// Engineer", "Software Engineer Intern, Accounting Platform") — these phrases
// never head a non-CS role, so they WIN over EXCLUDE. Deliberately NOT bare
// "engineer" (mechanical/civil/etc. use it). PARITY: mirror lib/upsert-role.ts.
const STRONG_TECH =
  /\b(software\s+(engineer|developer)|software development engineer|machine learning|deep learning|data scien|data engineer|analytics engineer|full[\s-]?stack|back[\s-]?end\s+engineer|front[\s-]?end\s+engineer|devops|site reliability|\bsre\b|security engineer|firmware|compiler|distributed systems|graphics engineer|rendering|\bsdet\b)/i;

// Broad CS-technical INCLUDE — EVERY CS-technical family (completeness-first,
// Karthik 2026-07-18: never miss a real role; he filters the noise himself).
// SWE/Frontend/Backend/Fullstack/Mobile, AI/ML/GenAI/LLM/NLP/CV, Data
// Science/Eng/Analytics/BI, Data/Business/Product Analyst, Quant, DevOps/SRE/
// Platform/Infra/Cloud, Security/Cyber, QA/SDET/Test, Product & (T)PM, Solutions/
// Sales/Forward-Deployed Eng, DevRel, UX/UI, Robotics/Embedded/Firmware,
// Research/Applied Scientist, Systems/Compiler/Distributed/Network, Games/Graphics,
// Hardware/Architect, and bank "Technology (Summer) Analyst" SWE tracks. Bare
// ai/ml/bi/technology kept on purpose; the non-tech "<dept> AI/analytics"
// compounds are cut by EXCLUDE below.
const INCLUDE =
  /\b(software|swe|sde|develop(er|ment)?|programmer|programming|full[\s-]?stack|back[\s-]?end|front[\s-]?end|engineer|engineering|machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|\bllm\b|generative ai|computer vision|reinforcement learning|data scien|data engineer|data analyst|business analyst|product analyst|business systems analyst|analytics|business intelligence|\bbi\b|infrastructure|\bplatform\b|\bcloud\b|security|cyber|appsec|infosec|robotics|perception|autonomy|autonomous|embedded|firmware|scientist|research|devops|site reliability|\bsre\b|\bqa\b|\bsdet\b|quality assurance|quality engineer|test engineer|fpga|quant|systems|compiler|distributed|network|rendering|graphics|game|gameplay|solutions engineer|sales engineer|forward deployed|field engineer|implementation engineer|developer advocate|developer relations|devrel|product manager|product management|program manager|project manager|associate product manager|\bapm\b|\btpm\b|\bux\b|\bui\b|user experience|ic design|hardware|architect|technology)/i;

// EXCLUDE — clearly NON-technical functions only, as PRECISE compounds so a
// technical role that merely CONTAINS one of these words survives (Sales
// *Engineer*, *Data* Analyst, *Business* Analyst, Backend Engineer/*Treasury*).
// EXCLUDE loses to STRONG_TECH. Bare department words (sales/design/product/
// analyst/business) are FORBIDDEN here — they misfire on real CS titles.
const EXCLUDE =
  /\b(marketing|human resources|\bhr\b|people ops|talent acquisition|recruit(ing|er|ment)?|sales development|sales representative|sales rep\b|account executive|account manager|business development|\bsdr\b|\bbdr\b|sales strategy|market research|financial analyst|finance analyst|finance intern|accounting|investment banking|financial reporting|legal|counsel|paralegal|public relations|social media|content marketing|customer success|customer support|customer experience|graphic design|visual design|product marketing|product operations|business operations|sales operations|marketing operations|people operations|management analyst|mechanical engineer(ing)?|civil engineer(ing)?|chemical engineer(ing)?|biomedical engineer(ing)?|industrial engineer(ing)?|environmental engineer(ing)?|aerospace engineer(ing)?|materials engineer(ing)?|manufacturing engineer(ing)?|structural engineer(ing)?|pharmac(y|ist|eutical|ists|ies)|nursing|clinical|phlebotom)\b/i;

// Widened 2026-09-02 (MISSION v7 D8): fall/spring/winter/autumn/co-op are no
// longer automatic rejections — the app derives lib/season.ts's season enum
// from the title instead (an unrecognized term ingests as "unspecified", never
// dropped here). Still drop any explicit year ≤2026 and a near-term
// "summer '20"-"summer '26". Term-less titles are KEPT (the LLM verifies the term).
const WRONG_TERM = /\b(2019|2020|2021|2022|2023|2024|2025|2026)\b|summer\s*'?2[0-6]\b/i;

// Light US filter. countryHint (when the ATS gives one) is authoritative;
// otherwise scan the free-text location. Ambiguous / remote / term-less US
// signals are KEPT (recall-first — the LLM confirms US).
const US_TOKENS =
  /\b(u\.?s\.?a?|united states|remote)\b|,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b|\b(new york|san francisco|seattle|boston|austin|chicago|los angeles|mountain view|menlo park|palo alto|sunnyvale|bellevue|redmond|atlanta|denver|dallas|houston|washington|dc|pittsburgh|cambridge|santa clara|san jose|san diego|cupertino|bay area)\b/i;
const NON_US_COUNTRY =
  /\b(canada|toronto|vancouver|montreal|united kingdom|london|england|ireland|dublin|germany|berlin|munich|france|paris|netherlands|amsterdam|india|bangalore|bengaluru|hyderabad|pune|singapore|australia|sydney|japan|tokyo|china|beijing|shanghai|israel|tel aviv|zurich|switzerland|spain|madrid|barcelona|poland|warsaw|krakow|sweden|stockholm|brazil|mexico|korea|seoul|hong kong|taiwan|romania|portugal|lisbon|italy|milan|denmark|norway|finland|austria|belgium|czech|hungary|greece|turkey|uae|dubai|philippines|vietnam|malaysia|thailand|indonesia|argentina|chile|colombia|egypt|nigeria|south africa|new zealand)\b/i;

export function isTargetTitle(title) {
  if (!title || !INTERN.test(title)) return false;
  // EXCLUDE loses to STRONG_TECH: a genuine CS-eng title in a non-tech dept stays.
  if (EXCLUDE.test(title) && !STRONG_TECH.test(title)) return false;
  if (!INCLUDE.test(title)) return false;
  if (WRONG_TERM.test(title)) return false;
  return true;
}

export function looksUS(locationStr, countryHint) {
  if (countryHint) {
    const c = String(countryHint).toLowerCase();
    if (/united states|usa|^us$|^u\.s/.test(c)) return true;
    if (NON_US_COUNTRY.test(c)) return false;
    // unknown country code — fall through to the free-text scan
  }
  const loc = locationStr || "";
  if (US_TOKENS.test(loc)) return true;
  if (NON_US_COUNTRY.test(loc)) return false;
  return true; // ambiguous / blank → keep, LLM confirms
}

export function bucket(title) {
  const t = title.toLowerCase();
  if (/\bquant/.test(t)) return "Quant";
  if (/machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|research scien/.test(t)) return "AI";
  if (/data scien|data engineer|analytics engineer/.test(t)) return "Data";
  return "SWE";
}

function withinWindow(iso, sinceDays) {
  if (!iso) return true; // no date → keep (LLM/recency-sort handles it)
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  const ageDays = (Date.now() - t) / 86400000;
  return ageDays <= sinceDays;
}

// NaN-guarded (mirrors withinWindow): an unparseable-but-truthy date must not
// throw inside the endpoint loop and abort the rest of that endpoint's jobs.
const isoDate = (iso) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};

// The webhook payload for one candidate. Deliberately MINIMAL: no lifecycle,
// eligible, or eligibility_note. The scanner runs 2x/day and re-finds the same
// roles inside their recency window, hitting the webhook's UPDATE path; if it
// sent lifecycle:"found"/eligible:null/a scan note, every re-post would DEMOTE a
// role the LLM already verified (eligible→found, wipe the note) and it would
// vanish from Matches/Home. Omitting those fields makes a re-post a no-op on
// verification: insert defaults lifecycle to "open" + eligible to null; update
// leaves the LLM's lifecycle/eligible/note untouched (upsert-role only patches
// fields that are `!== undefined`).
// job.approxDate ⇒ the source only gives a RECONSTRUCTED/relative date (Workday's
// "Posted Today"), which slices to a different UTC day across a midnight boundary
// and would mint a new (company,title,posted_at) dedup key on a later run → a
// duplicate insert → a spurious re-notify. For those, send posted_at:null (one
// stable dedup row per company+title, exactly what feeds/alerts already do). The
// recency window still uses the reconstructed date; only the payload date is
// nulled. Sources with real absolute dates (Greenhouse/Ashby/Lever/SR/Amazon/
// Oracle/Phenom) keep their date.
// location (D34, MISSION v5): every per-ATS normalizer above already computes
// `job.location` (greenhouse location.name / lever categories.location /
// ashby location / smartrecruiters joined city+region / workday
// locationsText / etc.) — pass it through when non-empty so roles.location
// gets backfilled at ingest. upsert-role.ts only writes it when the stored
// value is null, so a later re-find never churns it.
export function buildCandidate(company, job) {
  return {
    company,
    title: job.title.trim(),
    role_type: bucket(job.title),
    posted_at: job.approxDate ? null : isoDate(job.published),
    link: job.url,
    source: "scanner",
    location: job.location || null,
  };
}

// ---- Workday (POST + relative dates + pagination) ----
// Workday's CXS API is POST-only, returns 20/page, sorts by RELEVANCE not date,
// and dates are relative strings. So this is a coarser net than the JSON ATS
// APIs: we page through the "intern" search, map postedOn→an approximate date,
// and let the shared title/US/window filters cut the rest. The weekly manual
// sweep stays the backstop for these tenants (§8).
// ponytail: 12 pages (240 postings) per tenant — a role posted today that sits
// deeper than that is missed this run (caught next run or by the manual sweep).
const WD_LIMIT = 20;
const WD_MAX_PAGES = 12;
const isoAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
function wdDate(postedOn) {
  if (!postedOn) return isoAgo(31); // unknown → treat as old (safely outside window)
  const s = String(postedOn).toLowerCase();
  if (/today/.test(s)) return isoAgo(0);
  if (/yesterday/.test(s)) return isoAgo(1);
  const m = s.match(/(\d+)\s*\+?\s*days?\s*ago/);
  if (m) return isoAgo(Number(m[1]));
  return isoAgo(31);
}
async function fetchWorkday(ep, fetchFn) {
  const url = `https://${ep.host}/wday/cxs/${ep.tenant}/${ep.site}/jobs`;
  const out = [];
  for (let page = 0; page < WD_MAX_PAGES; page++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let data;
    try {
      const res = await fetchFn(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: WD_LIMIT, offset: page * WD_LIMIT, searchText: "intern" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }
    const posts = data.jobPostings || [];
    for (const j of posts) {
      out.push({
        title: j.title,
        location: j.locationsText || "",
        country: null,
        published: wdDate(j.postedOn),
        id: j.externalPath || j.title,
        url: j.externalPath ? `https://${ep.host}/en-US/${ep.site}${j.externalPath}` : null,
        approxDate: true, // relative "Posted Today/N days ago" → send posted_at:null (see buildCandidate)
      });
    }
    if (posts.length < WD_LIMIT) break;
    if ((page + 1) * WD_LIMIT >= (data.total || 0)) break;
  }
  return out;
}

// ---- per-ATS fetch + normalize ----
function fetchUrl(ats, token) {
  switch (ats) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=false`;
    case "lever":
      return `https://api.lever.co/v0/postings/${token}?mode=json`;
    case "smartrecruiters":
      // ponytail: first 100 postings only; SR returns newest-first, so a few-day
      // recency window is safe. Add an offset loop if a board exceeds 100 recent.
      return `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100`;
    default:
      return null;
  }
}

// Each returns [{ title, location, country, published, id, url }].
function normalize(ats, data) {
  if (ats === "greenhouse") {
    return (data.jobs || []).map((j) => ({
      title: j.title,
      location: j.location?.name || "",
      country: null,
      published: j.first_published || j.updated_at || null,
      id: String(j.id),
      url: j.absolute_url || null,
    }));
  }
  if (ats === "ashby") {
    return (data.jobs || [])
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        title: j.title,
        location: typeof j.location === "string" ? j.location : "",
        country: j.address?.postalAddress?.addressCountry || null,
        published: j.publishedAt || null,
        id: String(j.id),
        url: j.jobUrl || j.applyUrl || null,
      }));
  }
  if (ats === "lever") {
    const arr = Array.isArray(data) ? data : [];
    return arr.map((j) => ({
      title: j.text,
      location: j.categories?.location || "",
      country: j.country || null,
      published: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      id: String(j.id),
      url: j.hostedUrl || j.applyUrl || null,
    }));
  }
  if (ats === "smartrecruiters") {
    return (data.content || []).map((j) => ({
      title: j.name,
      location: j.location?.fullLocation || [j.location?.city, j.location?.region].filter(Boolean).join(", "),
      country: j.location?.country || null,
      published: j.releasedDate || null,
      id: String(j.id),
      // j.ref is the API self-link (raw JSON) — construct the browsable public
      // posting URL instead so the link is actually openable.
      url: j.company?.identifier ? `https://jobs.smartrecruiters.com/${j.company.identifier}/${j.id}` : null,
    }));
  }
  return [];
}

async function fetchJson(url, headers, fetchFn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: ctrl.signal, headers: { accept: "application/json", ...headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---- Amazon (amazon.jobs search.json) ----
// Real absolute dates ("May 13, 2026" — Date.parse handles it). country[] is not
// reliably honored, so the shared looksUS filter does the US cut.
// ponytail: 100 most-recent postings per run; add an offset loop only if Amazon
// ever posts >100 matching interns inside the recency window (it doesn't today).
async function fetchAmazon(_ep, fetchFn) {
  const data = await fetchJson(
    "https://www.amazon.jobs/en/search.json?base_query=intern&result_limit=100&sort=recent",
    { "user-agent": UA },
    fetchFn,
  );
  // Throw (→ visible in failed[]) if the container is ABSENT — a renamed/omitted
  // jobs[] is schema drift, not a legit empty board, and must not pass silently.
  if (!Array.isArray(data.jobs)) throw new Error("amazon: missing jobs[] (schema drift?)");
  return data.jobs.filter(Boolean).map((j) => ({
    title: j.title,
    location: j.normalized_location || [j.city, j.state, j.country_code].filter(Boolean).join(", "),
    country: j.country_code || null,
    published: j.posted_date || null,
    id: String(j.id_icims || j.id || j.job_path || j.title),
    url: j.job_path ? `https://www.amazon.jobs${j.job_path}` : null,
  }));
}

// ---- Oracle Fusion Recruiting Cloud (recruitingCEJobRequisitions) ----
// ep: { host, site }. keyword=intern is a fuzzy relevance match (returns non-
// intern titles too) — the shared isTargetTitle title-gate cuts those. The list
// is nested at items[0].requisitionList.items[].
async function fetchOracle(ep, fetchFn) {
  const url =
    `https://${ep.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=${ep.site},` +
    `limit=100,offset=0,sortBy=POSTING_DATES_DESC,keyword=intern`;
  const data = await fetchJson(url, { "REST-Framework-Version": "4", "user-agent": UA }, fetchFn);
  // items[] absent ⇒ schema drift → throw (visible). Present-but-no-requisitionList
  // is a legit empty result → [].
  if (!Array.isArray(data.items)) throw new Error("oracle: missing items[] (schema drift?)");
  const list = data.items[0]?.requisitionList?.items || [];
  return list.filter(Boolean).map((r) => ({
    title: r.Title,
    location: r.PrimaryLocation || "",
    country: r.PrimaryLocationCountry || null,
    published: r.PostedDate || null,
    id: String(r.Id || r.Title),
    url: `https://${ep.host}/hcmUI/CandidateExperience/en/sites/${ep.site}/job/${r.Id}`,
  }));
}

// ---- Phenom People (careers <host>/api/jobs) ----
// ep: { host }. jobs[].data carries a real ISO posted_date + apply_url.
async function fetchPhenom(ep, fetchFn) {
  const data = await fetchJson(`https://${ep.host}/api/jobs?keyword=intern&limit=100`, { "user-agent": UA }, fetchFn);
  if (!Array.isArray(data.jobs)) throw new Error("phenom: missing jobs[] (schema drift?)");
  // Skip null/dataless elements individually so one bad record doesn't drop the endpoint.
  return data.jobs
    .filter((w) => w && w.data)
    .map((w) => {
      const d = w.data;
      return {
        title: d.title,
        location: d.full_location || d.short_location || [d.city, d.state].filter(Boolean).join(", "),
        country: d.country_code || null,
        published: d.posted_date || null,
        id: String(d.req_id || d.slug || d.title),
        url: d.apply_url || (d.slug ? `https://${ep.host}/job/${d.slug}` : null),
      };
    });
}

// ---- Eightfold (public SmartApply /api/apply/v2/jobs) ----
// ep: { host, domain }. query=intern keyword-filters server-side (so count can
// legitimately be 0 off-season → NOT a full-board adapter, excluded from the canary).
// positions[] carries name / location(s) / t_create (epoch SECONDS, a REAL absolute
// date) / canonicalPositionUrl.
async function fetchEightfold(ep, fetchFn) {
  const data = await fetchJson(
    `https://${ep.host}/api/apply/v2/jobs?domain=${ep.domain}&hl=en&query=intern&start=0&num=100`,
    { "user-agent": UA },
    fetchFn,
  );
  if (!Array.isArray(data.positions)) throw new Error("eightfold: missing positions[] (schema drift?)");
  return data.positions.filter(Boolean).map((p) => ({
    title: p.name,
    location: p.location || (Array.isArray(p.locations) ? p.locations.join(", ") : ""),
    country: null,
    published: p.t_create ? new Date(p.t_create * 1000).toISOString().slice(0, 10) : null,
    id: String(p.display_job_id || p.ats_job_id || p.id || p.name),
    url: p.canonicalPositionUrl || null,
  }));
}

// ---- SAP SuccessFactors (public job_listing_summary XML) ----
// ep: { host, companyId }. The summary feed has NO date field → approxDate:true
// (posted_at:null, one stable dedup row per company+title, exactly like feeds/alerts;
// withinWindow(null) keeps it). Country/Location come from <filterN><label>/<value>
// pairs parsed BY LABEL TEXT (filter order varies by instance). Returns the whole
// board; isTargetTitle gates downstream. Not full-board-canaried (title-gated count).
async function fetchSuccessFactors(ep, fetchFn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let xml;
  try {
    const res = await fetchFn(
      `https://${ep.host}/career?company=${ep.companyId}&career_ns=job_listing_summary&resultType=XML`,
      { signal: ctrl.signal, headers: { "user-agent": UA } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } finally {
    clearTimeout(timer);
  }
  const blocks = xml.match(/<Job>[\s\S]*?<\/Job>/g);
  if (!blocks) throw new Error("successfactors: no <Job> elements (schema drift?)");
  const pick = (block, re) => {
    const m = block.match(re);
    return m ? m[1].trim() : "";
  };
  const filterVal = (block, labelRe) => {
    for (const f of block.matchAll(
      /<filter\d+>\s*<label>([\s\S]*?)<\/label>\s*<value>([\s\S]*?)<\/value>\s*<\/filter\d+>/g,
    )) {
      if (labelRe.test(f[1])) return f[2].trim();
    }
    return "";
  };
  return blocks
    .map((b) => {
      const title = pick(b, /<JobTitle>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/JobTitle>/);
      const reqId = pick(b, /<ReqId>([\s\S]*?)<\/ReqId>/);
      const country = filterVal(b, /country/i);
      return {
        title,
        location: filterVal(b, /location|city|state/i),
        country: country || null,
        published: null,
        id: reqId || title,
        url: `https://${ep.host}/career?company=${ep.companyId}&career_job_req_id=${reqId}&career_ns=job_application`,
        approxDate: true,
      };
    })
    .filter((j) => j.title);
}

// ATSs whose fetch shape isn't the simple GET-JSON of fetchUrl/normalize get a
// dedicated fetcher here, each returning the same [{title,location,country,
// published,id,url,approxDate?}] shape. Add a new class adapter by adding a line.
const SPECIAL_FETCHERS = {
  workday: fetchWorkday,
  amazon: fetchAmazon,
  oracle: fetchOracle,
  phenom: fetchPhenom,
  eightfold: fetchEightfold,
  successfactors: fetchSuccessFactors,
};

// Simple concurrency-capped map.
async function pool(items, limit, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function scanEndpoints(endpoints, { sinceDays, concurrency, fetch: fetchFn = globalThis.fetch }) {
  let okCount = 0;
  const failed = [];
  const candidates = [];
  const seen = new Set(); // ats:id within this run
  const rawCounts = {}; // epKey → raw postings fetched this run (for the canary)

  await pool(endpoints, concurrency, async (ep) => {
    const special = SPECIAL_FETCHERS[ep.ats];
    if (!special && !fetchUrl(ep.ats, ep.token)) {
      failed.push(`${ep.company} (unknown ats ${ep.ats})`);
      return;
    }
    try {
      const jobs = special ? await special(ep, fetchFn) : normalize(ep.ats, await fetchJson(fetchUrl(ep.ats, ep.token), {}, fetchFn));
      okCount++;
      rawCounts[epKey(ep)] = jobs.length;
      for (const job of jobs) {
        if (!isTargetTitle(job.title)) continue;
        if (!withinWindow(job.published, sinceDays)) continue;
        if (!looksUS(job.location, job.country)) continue;
        const key = `${epKey(ep)}:${job.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(buildCandidate(ep.company, job));
      }
    } catch (err) {
      failed.push(`${ep.company} (${ep.ats}: ${err.message})`);
    }
  });

  // Collapse multi-location postings that share a (company,title,posted_at)
  // dedup key so we send one row, not insert+N-1 redundant updates.
  const roles = [];
  const postedSeen = new Set();
  for (const c of candidates) {
    const k = `${c.company}|${c.title}|${c.posted_at}`;
    if (postedSeen.has(k)) continue;
    postedSeen.add(k);
    roles.push(c);
  }

  return { roles, okCount, failed, rawCounts };
}
