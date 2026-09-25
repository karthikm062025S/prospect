// JD snapshot (RB-015, TRD §6): capture a posting's description as SANITIZED
// HTML so the application record survives the posting being taken down.
//
// THIS MODULE IS A TRUST BOUNDARY (TRD §9a). Untrusted employer HTML comes in;
// what comes out is rendered into the gate-holder's session with
// dangerouslySetInnerHTML. sanitizeJobHtml() re-serializes from scratch: the
// browser never sees the original bytes, only the tags this file emits — an
// exact allowlist (h1-h4 p ul ol li strong em br a[href]) with no attributes
// except a normalized absolute http(s) href + fixed rel/target on anchors.
// tests/jd-snapshot.test.ts (fixtures in tests/fixtures/jd/) is the proof.
//
// D25 (v5): the output must READ like the employer's page. Structural wrappers
// (div/section/td/…) are not allowlisted, but each one is a BLOCK BOUNDARY and
// bare text gets an implicit <p>, so a div-only posting comes out as paragraphs
// instead of one run-on block. See BLOCK / ensureBlock / blockBreak below.
//
// note: hand-written tokenizer, no HTML-parser dependency.
// Ceiling: no readability/main-content extraction — a page-fetch snapshot may
// carry site chrome; the detail pane shows it in a scroll box (TRD §6 step 2).
// Ceiling: JS-rendered boards (lifeattiktok, jobs.bytedance) and bot walls
// (*.icims.com answers every GET with a "Human Verification" 405) need a
// headless browser, which D5 forbids; they stay page-fetch failures.
//
// No DB writes here: the caller (applied-confirm action, slice 5; re-capture
// button, slice 7) stores `jd_snapshot` + `jd_snapshot_at` from the result.
// Pure except for the injected `fetch`.

export type Endpoint = {
  company: string;
  ats: string;
  token?: string;
  host?: string;
  tenant?: string;
  site?: string;
  companyId?: string;
  domain?: string;
};
export type JdVendor = "greenhouse" | "lever" | "ashby" | "workday" | "oracle";
export type JdSnapshot = { html: string; captured_at: string; via: "ats" | "page" };

export const JD_SNAPSHOT_MAX_BYTES = 200 * 1024;
// Raw input is cut here BEFORE tokenizing (audit F1: bounds CPU + memory on a
// hostile page); the stored output is capped separately at JD_SNAPSHOT_MAX_BYTES.
export const JD_RAW_MAX = 1 << 20;
// Open-tag stack bound: deeper opens are stripped (their text still flows).
// Keeps closeTo()'s lastIndexOf O(64) instead of quadratic, and bounds the
// close-tag bytes capBytes must reserve (64 x "</strong>"). No real posting
// nests anywhere near this.
const MAX_DEPTH = 64;
const MAX_CLOSE_BYTES = MAX_DEPTH * "</strong>".length;
// 8s, not 5s: the live audit (2026-08-24) lost captures to slow career pages
// that answered in 5-7s. Still far under the ingest `after()` budget.
const DEFAULT_TIMEOUT_MS = 8000;
// Same browser UA as scripts/scan-core.mjs (D6: inlined, not imported). These
// are the ONLY headers this module ever sends (TRD §9b: the outbound fetch
// carries no secrets); accept/accept-language are what a header-sniffing career
// site expects from a real browser.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const BROWSER_HEADERS: Record<string, string> = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

// ------------------------------------------------------------------ entities --

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: "\u00a0" };
const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi;

// One decoding pass, never recursive: "&amp;lt;script&amp;gt;" becomes
// "&lt;script&gt;" (inert text), never "<script>". Used for Greenhouse's
// entity-encoded `content` field (TRD §13 spike 1) and for attribute values.
export function decodeEntitiesOnce(s: string): string {
  return s.replace(ENTITY, (m, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code > 0x10ffff) return m;
      // NUL and surrogate code points are not storable (Postgres rejects NUL /
      // invalid UTF-8 in text) -> U+FFFD, which is also what a browser renders.
      return code === 0 || (code >= 0xd800 && code <= 0xdfff) ? "\uFFFD" : String.fromCodePoint(code);
    }
    const v = NAMED[body.toLowerCase()];
    return v === undefined ? m : v;
  });
}

// Text node → output: whitespace runs collapse, well-formed entity references
// are kept AS-IS (so "&lt;script&gt;" stays inert text), every other & < > is
// escaped. Invariant: no raw "<" ever leaves this function.
// NUL and unpaired surrogates would make the snapshot unstorable (Postgres
// rejects NUL in text and invalid UTF-8) -> U+FFFD in every emitted string.
const UNSTORABLE = /\0|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function escapeText(s: string): string {
  return s
    .replace(UNSTORABLE, "\uFFFD")
    .replace(/\s+/g, " ")
    .replace(/&(?!(#x[0-9a-f]+|#[0-9]+|[a-z]+);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(UNSTORABLE, "\uFFFD").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseHttp(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(raw); // no base: relative and protocol-relative ("//evil") throw
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- sanitizer --

const ALLOWED = new Set(["h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "br", "a"]);
// h5/h6 have no allowlisted tag of their own; rendering them as the smallest
// heading keeps the posting's outline instead of dropping it into body text.
const RENAME: Record<string, string> = { b: "strong", i: "em", h5: "h4", h6: "h4" };
// Elements whose content a browser would NOT parse as markup: dropped whole,
// up to the matching close tag (or EOF), never emitted as text.
const RAW_TEXT = new Set(["script", "style", "iframe", "textarea", "title", "noscript", "noembed", "noframes", "xmp", "plaintext"]);
// D25: structural wrappers a browser lays out as BLOCKS. They carry no
// allowlisted semantics so they are never emitted, but every open AND close is
// a block boundary: the paragraph in progress ends there, so text on either
// side can never concatenate into one run-on paragraph (the bug D25 names).
// Anything not listed here and not allowlisted (span, code, font, small, u, …)
// stays INLINE: the tag is dropped, its text joins the surrounding run.
const BLOCK = new Set([
  "div", "section", "article", "header", "footer", "main", "aside",
  "table", "thead", "tbody", "tr", "td", "th",
  "blockquote", "pre", "dl", "dt", "dd",
  "figure", "figcaption", "hr", "form", "fieldset", "nav",
]);
// Opening one of these closes an open <p> (browser behaviour; keeps output balanced).
const CLOSES_P = new Set(["p", "h1", "h2", "h3", "h4", "ul", "ol", "li"]);
const HEADING = /^h[1-4]$/;
// Elements that can hold body text directly. If none is open, phrasing content
// gets an implicit <p> — that is what turns a div-only posting into paragraphs.
const TEXT_HOLDER = /^(p|li|h[1-4])$/;
const TAG_NAME = /[a-zA-Z][^\s/>]*/y;
const ATTR_NAME = /[^\s"'>/=]+/y;
const UNQUOTED = /[^\s>]*/y;
const WS = /[\s/]*/y;

type Tag = { end: number; href: string | null };

// Parses attributes from `p` to the closing ">". Returns null when the tag is
// unterminated (EOF inside it — dropped, like a browser drops it).
function parseAttrs(html: string, p: number): Tag | null {
  const n = html.length;
  let href: string | null = null;
  for (;;) {
    WS.lastIndex = p;
    p = WS.exec(html)![0].length + p;
    if (p >= n) return null;
    if (html[p] === ">") return { end: p + 1, href };
    ATTR_NAME.lastIndex = p;
    const nm = ATTR_NAME.exec(html);
    let name = "";
    if (nm && nm[0].length) {
      name = nm[0].toLowerCase();
      p += nm[0].length;
    } else {
      p++; // stray quote/equals in name position: consume it
    }
    WS.lastIndex = p;
    p = WS.exec(html)![0].length + p;
    let value = "";
    if (html[p] === "=") {
      p++;
      WS.lastIndex = p;
      p = WS.exec(html)![0].length + p;
      const q = html[p];
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, p + 1);
        if (close < 0) return null;
        value = html.slice(p + 1, close);
        p = close + 1;
      } else {
        UNQUOTED.lastIndex = p;
        value = UNQUOTED.exec(html)![0];
        p += value.length;
      }
    }
    if (name === "href" && href === null) href = value; // first wins, like browsers
  }
}

export function sanitizeJobHtml(html: string): string {
  if (typeof html !== "string" || !html) return "";
  if (html.length > JD_RAW_MAX) html = html.slice(0, JD_RAW_MAX);
  const out: string[] = [];
  // Each entry remembers where its open tag landed in `out`, so closing an
  // element that emitted nothing can delete the pair instead of leaving an
  // empty <p></p> behind (D25).
  const open: { name: string; at: number }[] = [];
  const emit = (name: string, markup: string) => {
    open.push({ name, at: out.length });
    out.push(markup);
  };
  const popOne = () => {
    const el = open.pop()!;
    // Trailing layout inside a block (a <br> or a space left by the last
    // wrapper close) is noise once the block ends. Only blocks: a space at the
    // end of <strong> is real text between two words.
    if (TEXT_HOLDER.test(el.name))
      while (out.length > el.at + 1) {
        const last = out[out.length - 1];
        if (last === "<br>") out.pop();
        else if (last[0] !== "<" && last.endsWith(" ")) {
          const t = last.replace(/ +$/, "");
          if (t) {
            out[out.length - 1] = t;
            break;
          }
          out.pop();
        } else break;
      }
    if (out.length === el.at + 1) out.length = el.at;
    else out.push(`</${el.name}>`);
  };
  const closeTo = (name: string) => {
    let at = -1;
    for (let k = open.length - 1; k >= 0; k--)
      if (open[k].name === name) {
        at = k;
        break;
      }
    if (at < 0) return;
    while (open.length > at) popOne();
  };
  const inBlock = () => open.some((e) => TEXT_HOLDER.test(e.name));
  const topName = () => (open.length ? open[open.length - 1].name : "");
  // True when the last thing emitted cannot be followed by a separator that
  // would mean anything (start of output, an open tag, a break, a space).
  const atBreak = () => {
    const last = out[out.length - 1];
    return last === undefined || last === "<br>" || last.endsWith(" ") || /^<[a-z]/.test(last);
  };
  // A structural wrapper opened or closed. End the paragraph in progress; inside
  // a heading or list item (which cannot hold a <p>) a <br> carries the break.
  const blockBreak = () => {
    if (open.some((e) => e.name === "p")) closeTo("p");
    else if (inBlock() && !atBreak()) out.push("<br>");
  };
  // Phrasing content with no text holder open: give it one, so top-level text is
  // never emitted bare (bare text is what let two blocks run together).
  const ensureBlock = () => {
    if (inBlock() || open.length >= MAX_DEPTH) return;
    const t = topName();
    emit(t === "ul" || t === "ol" ? "li" : "p", t === "ul" || t === "ol" ? "<li>" : "<p>");
  };
  // Text nodes split by stripped tags must not pile up spaces, so that
  // sanitize(sanitize(x)) === sanitize(x) (capBytes relies on this).
  const pushText = (s: string) => {
    let t = escapeText(s);
    if (!t) return;
    if (!t.trim()) {
      // A whitespace-only run separates two pieces of phrasing content inside a
      // block; BETWEEN blocks it is layout, not content, and emits nothing.
      if (inBlock() && !atBreak()) out.push(" ");
      return;
    }
    ensureBlock();
    if (t.startsWith(" ") && atBreak()) t = t.slice(1);
    if (t) out.push(t);
  };
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      pushText(html.slice(i));
      break;
    }
    if (lt > i) pushText(html.slice(i, lt));
    i = lt;
    const next = html[i + 1];
    if (next === "!" || next === "?") {
      // Comment: ends at "-->" or "--!>" (spec), so "<!-->" is an empty comment
      // and cannot hide a following <script>. Anything else (<!DOCTYPE, <?xml,
      // <![CDATA[) is a bogus comment ending at the first ">". Unterminated →
      // the rest is dropped. Nothing from a comment is ever emitted.
      if (html.startsWith("<!--", i)) {
        const re = /-->|--!>/g;
        re.lastIndex = i + 2;
        const m = re.exec(html);
        i = m ? m.index + m[0].length : n;
      } else {
        const gt = html.indexOf(">", i);
        i = gt < 0 ? n : gt + 1;
      }
      continue;
    }
    const isClose = next === "/";
    TAG_NAME.lastIndex = isClose ? i + 2 : i + 1;
    const nm = TAG_NAME.exec(html);
    if (!nm) {
      out.push("&lt;"); // "<" that does not start a tag ("1 < 2", "<3")
      i++;
      continue;
    }
    const raw = nm[0].toLowerCase();
    const tag = parseAttrs(html, TAG_NAME.lastIndex);
    if (!tag) {
      i = n; // EOF inside a tag: browsers drop it; so do we
      break;
    }
    i = tag.end;
    const name = RENAME[raw] ?? raw;
    if (isClose) {
      if (BLOCK.has(raw)) blockBreak();
      else if (ALLOWED.has(name) && name !== "br") closeTo(name);
      continue;
    }
    if (RAW_TEXT.has(raw)) {
      if (raw === "plaintext") break; // everything after is text in a browser; drop
      const re = new RegExp(`</${raw}[\\s/>]`, "ig");
      re.lastIndex = i;
      const m = re.exec(html);
      i = m ? m.index : n; // the close tag itself is then parsed and dropped
      continue;
    }
    if (BLOCK.has(raw)) {
      blockBreak(); // structural wrapper: a boundary, never a tag
      continue;
    }
    if (!ALLOWED.has(name)) continue; // inline (span, code, …): strip, keep the text
    if (name === "br") {
      if (!inBlock()) continue; // a <br> between blocks is layout, not content
      out.push("<br>");
      continue;
    }
    if (name === "a") {
      const u = parseHttp(decodeEntitiesOnce(tag.href ?? ""));
      if (!u) continue; // anchor degrades to its text
      closeTo("a"); // anchors never nest
      ensureBlock();
      if (open.length >= MAX_DEPTH) continue;
      emit("a", `<a href="${escapeAttr(u.href)}" rel="noopener noreferrer" target="_blank">`);
      continue;
    }
    if (CLOSES_P.has(name)) closeTo("p");
    if (name === "li") {
      for (let k = open.length - 1; k >= 0; k--) {
        const t = open[k].name;
        if (t === "ul" || t === "ol") break;
        if (t === "li") {
          closeTo("li");
          break;
        }
      }
    }
    if (HEADING.test(name) && HEADING.test(topName())) popOne();
    if (name === "strong" || name === "em") ensureBlock();
    if (open.length >= MAX_DEPTH) continue; // too deep: strip the tag, keep its text
    emit(name, `<${name}>`);
  }
  while (open.length) popOne();
  return out.join("");
}

// Caps SANITIZED html at JD_SNAPSHOT_MAX_BYTES (utf-8). The byte budget
// already reserves the note + the most close-tag bytes a MAX_DEPTH stack can
// add, so pass 1 always fits; it backs out of a partial tag / entity / code
// point, re-sanitizes (closes whatever was left open; the sanitizer is
// idempotent on its own output) and appends a visible note. The loop is a
// guard with a hard iteration cap and a budget that never goes negative.
const TRUNCATION_NOTE = "<p><em>[Posting text truncated at 200 KB]</em></p>";
const enc = new TextEncoder();
export function capBytesStats(html: string): { html: string; passes: number } {
  const bytes = enc.encode(html);
  if (bytes.length <= JD_SNAPSHOT_MAX_BYTES) return { html, passes: 0 };
  let budget = JD_SNAPSHOT_MAX_BYTES - enc.encode(TRUNCATION_NOTE).length - MAX_CLOSE_BYTES;
  for (let passes = 1; ; passes++) {
    let cut = new TextDecoder().decode(bytes.subarray(0, Math.max(0, budget))).replace(/\uFFFD+$/, "");
    const lastLt = cut.lastIndexOf("<");
    if (lastLt > cut.lastIndexOf(">")) cut = cut.slice(0, lastLt);
    const lastAmp = cut.lastIndexOf("&");
    if (lastAmp > cut.lastIndexOf(";")) cut = cut.slice(0, lastAmp);
    const capped = sanitizeJobHtml(cut) + TRUNCATION_NOTE;
    const over = enc.encode(capped).length - JD_SNAPSHOT_MAX_BYTES;
    if (over <= 0) return { html: capped, passes };
    if (budget <= 0 || passes >= 4) return { html: TRUNCATION_NOTE, passes }; // unreachable by construction; never spin
    budget -= over;
  }
}
const capBytes = (html: string) => capBytesStats(html).html;

// ------------------------------------------------------------ vendor routing --

const rec = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

// Decides TRD §6 step 1 (vendor API) vs step 2 (page fetch), purely.
//
// DECISION: the vendor + board token + posting id come from `role.link`'s host
// and path — NOT from `company.ats` / `company.endpoint`. Ground truth 2026-08-23:
// those two columns are NULL for all 493 companies (db/baseline-2026-09) and no
// code writes them; `roles.source` is "scanner"/"feed:*", never a vendor. The
// link is the one field every role has and it is the truth for that posting.
// `company.ats`/`endpoint` are accepted for the contract and reserved.
// `endpoints` (scripts/endpoints.json, passed by the caller) resolves two things
// the link cannot: the Workday tenant by host (falls back to the host's first
// label, which matches all 95 Workday endpoints) and the Greenhouse board token
// for EMBEDDED boards (company site + ?gh_jid=; matched by `company.name`,
// which the watcher sets verbatim from the endpoint's `company`).
//
// Because the API host is fixed per vendor, an attacker-shaped link can only
// change the PATH of the vendor-API request, never where it goes.
export function atsDescriptionUrl(
  company: { ats: string | null; endpoint: string | null; name?: string | null },
  role: { link: string | null; source: string | null },
  endpoints: Endpoint[],
): { url: string; vendor: JdVendor; pick: (json: unknown) => string | null } | null {
  const u = parseHttp(role.link);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split("/").filter(Boolean);

  // Greenhouse: per-job GET ?content=true; `content` is entity-encoded HTML.
  const greenhouse = (token: string, id: string) => ({
    vendor: "greenhouse" as const,
    url: `https://boards-api.greenhouse.io/v1/boards/${token}/jobs/${id}?content=true`,
    pick: (json: unknown) => {
      const c = str(rec(json)?.content);
      return c === null ? null : decodeEntitiesOnce(c);
    },
  });
  if (host === "job-boards.greenhouse.io" || host === "boards.greenhouse.io") {
    // /{token}/jobs/{id}
    const [token, jobs, id] = segs;
    if (!token || jobs !== "jobs" || !id || !/^\d+$/.test(id)) return null;
    return greenhouse(token, id);
  }
  const ghJid = u.searchParams.get("gh_jid");
  if (ghJid && /^\d+$/.test(ghJid)) {
    const name = company.name?.toLowerCase();
    const ep = name ? endpoints.find((e) => e.ats === "greenhouse" && !!e.token && e.company.toLowerCase() === name) : undefined;
    // No endpoints.json match: an embedded board's token is almost always the
    // host's own label (careers.roblox.com -> "roblox", epicgames.com ->
    // "epicgames"; both verified live 2026-08-24). A wrong guess is a 404 on a
    // fixed API host and falls through to the page fetch, so it costs one
    // request and can never reach an attacker-chosen origin.
    const guess = host
      .split(".")
      .filter((l) => l && !/^(www|careers?|jobs?|apply|boards|talent|work|join|hire|hiring|m|en)$/.test(l))[0];
    const token = ep?.token ?? (guess && !/^(com|org|net|io|co|ai|dev|us|uk|eu)$/.test(guess) ? guess : null);
    if (token) return greenhouse(token, ghJid);
  }
  if (host === "jobs.lever.co") {
    // /{token}/{postingId}[/apply] → the list call already embeds `description`.
    const [token, id] = segs;
    if (!token || !id) return null;
    return {
      vendor: "lever",
      url: `https://api.lever.co/v0/postings/${token}?mode=json`,
      // A9: `description` is only the INTRO. The body lives in `lists[]`
      // ({text: section heading, content: <li> markup}) and `additional`, so a
      // description-only snapshot reads as one orphan paragraph. Compose all
      // three in posting order; sanitizeJobHtml escapes `text` like any other
      // untrusted string, so the <h3>/<ul> wrappers add no new trust surface.
      pick: (json) => {
        if (!Array.isArray(json)) return null;
        const post = rec(json.find((j) => rec(j)?.id === id));
        if (!post) return null;
        const parts = [str(post.description) ?? ""];
        if (Array.isArray(post.lists))
          for (const entry of post.lists) {
            const l = rec(entry);
            if (!l) continue;
            const heading = str(l.text);
            const content = str(l.content);
            if (heading) parts.push(`<h3>${heading}</h3>`);
            if (content) parts.push(`<ul>${content}</ul>`);
          }
        parts.push(str(post.additional) ?? "");
        const html = parts.join("");
        return html.trim() ? html : null;
      },
    };
  }
  if (host === "jobs.ashbyhq.com") {
    // /{token}/{jobId}[/application] → the board list embeds `descriptionHtml`.
    const [token, id] = segs;
    if (!token || !id) return null;
    return {
      vendor: "ashby",
      url: `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=false`,
      pick: (json) => {
        const jobs = rec(json)?.jobs;
        return Array.isArray(jobs) ? str(rec(jobs.find((j) => rec(j)?.id === id))?.descriptionHtml) : null;
      },
    };
  }
  if (host.endsWith(".myworkdayjobs.com")) {
    // https://{host}/[{locale}/]{site}{externalPath} where externalPath is
    // /job/... or /details/...; CXS GET {host}/wday/cxs/{tenant}/{site}{externalPath}.
    const s = /^[a-z]{2}-[a-z]{2}$/i.test(segs[0] ?? "") ? segs.slice(1) : segs;
    const [site, kind] = s;
    if (!site || (kind !== "job" && kind !== "details") || s.length < 3) return null;
    const ep = endpoints.find((e) => e.ats === "workday" && e.host?.toLowerCase() === host);
    const tenant = ep?.tenant || host.split(".")[0];
    return {
      vendor: "workday",
      url: `https://${host}/wday/cxs/${tenant}/${site}/${s.slice(1).join("/")}`,
      pick: (json) => str(rec(rec(json)?.jobPostingInfo)?.jobDescription),
    };
  }
  if (host.endsWith(".oraclecloud.com")) {
    // Oracle Candidate Experience is a client-rendered SPA: the page fetch of
    // /hcmUI/CandidateExperience/{locale}/sites/{site}/job/{id} sanitizes to
    // nothing (measured 2026-08-24 — the largest single failure class, ~69 open
    // roles). Its CE REST API is public and returns the posting as HTML fields.
    const i = segs.indexOf("sites");
    if (i < 0) return null;
    const [site, kind, id] = segs.slice(i + 1);
    if (!site || kind !== "job" || !id || !/^[A-Za-z0-9_-]+$/.test(site) || !/^\d+$/.test(id)) return null;
    return {
      vendor: "oracle",
      url: `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById%3BId%3D${id}%2CsiteNumber%3D${site}`,
      pick: (json) => {
        const items = rec(json)?.items;
        const it = Array.isArray(items) ? rec(items[0]) : null;
        if (!it) return null;
        // The CE UI stacks these in this order; each is already block HTML, so
        // plain concatenation keeps the employer's own headings and adds none.
        const html = ["ExternalDescriptionStr", "ExternalResponsibilitiesStr", "ExternalQualificationsStr", "CorporateDescriptionStr", "OrganizationDescriptionStr"]
          .map((k) => str(it[k]) ?? "")
          .join("");
        return html.trim() ? html : null;
      },
    };
  }
  return null; // SmartRecruiters / Amazon / Phenom / Eightfold / SF / anything else → page fetch
}

// ------------------------------------------------------------ ld+json JobPosting --
// D-ldjson (this leaf): ~40% of open roles have no vendor API above and go
// through the page-fetch path below, which otherwise carries the whole page's
// chrome (nav, cookie banner, footer). Most career pages embed a schema.org
// JobPosting as <script type="application/ld+json">; its `description` is the
// posting's own clean HTML. This is one well-known, narrow convention — NOT
// readability/main-content extraction (the file-header ceiling note still
// holds for everything else).
const LD_JSON_SCRIPT = /<script\b[^>]*\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script\s*>/gi;
// Minimum sanitized size before an ld+json description is trusted over the
// whole page: a JobPosting stub with a one-line placeholder description (some
// boards post one before the real content loads client-side) is worse than
// the page fallback, not better.
export const JD_LDJSON_MIN_BYTES = 200;

// Depth-bounded search: array → each element; @graph → its array; mainEntity →
// one nested object (a WebPage wrapping a JobPosting is the common shape). No
// unbounded object-tree walk — a JobPosting the page didn't put in one of
// these three well-known spots is a miss, not a slow scan of arbitrary JSON.
function findJobPosting(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const r = rec(node);
  if (!r) return null;
  const t = r["@type"];
  if (t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"))) return r;
  if (r["@graph"] !== undefined) {
    const found = findJobPosting(r["@graph"], depth + 1);
    if (found) return found;
  }
  if (r["mainEntity"] !== undefined) {
    const found = findJobPosting(r["mainEntity"], depth + 1);
    if (found) return found;
  }
  return null;
}

// jobLocation (object or array of schema.org Place) first, then
// applicantLocationRequirements.name (a remote-eligible posting that names a
// country/region instead of a Place). Empty strings count as absent — some
// boards emit a Place with every address field blank.
function pickLdJsonLocation(posting: Record<string, unknown>): string | null {
  const fromPlace = (place: unknown): string | null => {
    const addr = rec(rec(place)?.address);
    if (!addr) return null;
    const locality = str(addr.addressLocality) || null;
    const region = str(addr.addressRegion) || null;
    return locality && region ? `${locality}, ${region}` : (locality ?? region);
  };
  const jobLocation = posting.jobLocation;
  if (Array.isArray(jobLocation)) {
    for (const loc of jobLocation) {
      const s = fromPlace(loc);
      if (s) return s;
    }
  } else {
    const s = fromPlace(jobLocation);
    if (s) return s;
  }
  const req = posting.applicantLocationRequirements;
  for (const r of Array.isArray(req) ? req : req ? [req] : []) {
    const name = str(rec(r)?.name) || null;
    if (name) return name;
  }
  return null;
}

// Scans the raw page for every ld+json block (case-insensitive `type`, either
// quote style, any attribute order), tolerates a malformed one (JSON.parse in
// try/catch; skip it and keep scanning), and returns the FIRST JobPosting
// found (string `@type`, or an array containing it). `description` may be
// HTML-escaped once by the page (decoded via the existing decodeEntitiesOnce,
// same treatment as Greenhouse's `content` field above) — never rendered raw;
// every caller still runs it through sanitizeJobHtml. Never throws.
export function extractJobPostingLdJson(
  html: string,
): { description: string; location: string | null; datePosted: string | null; validThrough: string | null } | null {
  LD_JSON_SCRIPT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LD_JSON_SCRIPT.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const posting = findJobPosting(parsed);
    if (!posting) continue;
    const description = str(posting.description);
    if (!description) continue;
    return {
      description: decodeEntitiesOnce(description),
      location: pickLdJsonLocation(posting),
      datePosted: str(posting.datePosted),
      validThrough: str(posting.validThrough),
    };
  }
  return null;
}

// Sanitizes+caps an ld+json JobPosting's description (if the page has one) and
// reports whether it clears JD_LDJSON_MIN_BYTES. `ok: false` still carries
// `location`: captureJobPosting surfaces it even when the description itself
// is too thin to trust over the whole-page fallback.
function ldJsonHtml(raw: string): { html: string; location: string | null; ok: boolean } | null {
  const posting = extractJobPostingLdJson(raw);
  if (!posting) return null;
  const html = capBytes(sanitizeJobHtml(posting.description));
  return { html, location: posting.location, ok: enc.encode(html).length >= JD_LDJSON_MIN_BYTES };
}

// ------------------------------------------------------------------ capture --

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// One fetch + body read under one AbortController timeout. Raced against the
// timer as well, so a fetch that ignores its signal still cannot hang the caller.
async function fetchWithTimeout<T>(fetchFn: typeof fetch, url: string, ms: number, read: (res: Response) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`timeout after ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([
      (async () => {
        const res = await fetchFn(url, { signal: ctrl.signal, headers: BROWSER_HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return read(res);
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ATS API first (per TRD §13 spike 1), page fetch of roles.link as fallback,
// BOTH through sanitizeJobHtml + the 200 KB cap. Never throws: any failure →
// one JSON line on console.error ({lane:"jd", role_id, error}) and null; the
// caller's application row is already saved (TRD §6 step 3). Only ever call
// this for a role the gate-holder confirmed (TRD §9b) — that is the caller's
// contract; this module fetches whatever role it is handed.
export async function captureJobDescription(
  input: {
    role: { id: string; link: string | null; source: string | null };
    company: { ats: string | null; endpoint: string | null; name?: string | null };
  },
  opts: { fetch: typeof fetch; timeoutMs?: number; now?: () => Date; endpoints?: Endpoint[] },
): Promise<JdSnapshot | null> {
  const { role, company } = input;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = opts.now ?? (() => new Date());
  const errors: string[] = [];
  const finish = (raw: string, via: JdSnapshot["via"]): JdSnapshot => {
    const html = capBytes(sanitizeJobHtml(raw));
    if (!html.trim()) throw new Error("empty after sanitize");
    return { html, captured_at: now().toISOString(), via };
  };
  try {
    const plan = atsDescriptionUrl(company, role, opts.endpoints ?? []);
    if (plan) {
      try {
        const raw = await fetchWithTimeout(opts.fetch, plan.url, timeoutMs, async (res) => plan.pick(await res.json()));
        if (raw === null) throw new Error("no description field");
        return finish(raw, "ats");
      } catch (e) {
        errors.push(`ats ${plan.vendor} ${plan.url}: ${errMsg(e)}`);
      }
    }
    const link = parseHttp(role.link);
    if (!link) {
      errors.push("no http(s) link");
    } else {
      try {
        const raw = await fetchWithTimeout(opts.fetch, link.href, timeoutMs, (res) => res.text());
        // D-ldjson: prefer the JobPosting ld+json's own description (no site
        // chrome) over the whole page when it clears JD_LDJSON_MIN_BYTES.
        const ld = ldJsonHtml(raw);
        if (ld?.ok) return { html: ld.html, captured_at: now().toISOString(), via: "page" };
        return finish(raw, "page");
      } catch (e) {
        errors.push(`page ${link.href}: ${errMsg(e)}`);
      }
    }
  } catch (e) {
    errors.push(errMsg(e));
  }
  console.error(JSON.stringify({ lane: "jd", role_id: role.id, error: errors.join(" | ") }));
  return null;
}

// ------------------------------------------------------------ v5 ingest capture --
// ingest-time capture also needs the posting's LOCATION from
// the ATS JSON, which captureJobDescription's `pick` closures don't expose
// (description-only). This sibling reuses atsDescriptionUrl's vendor routing +
// this file's sanitizer/byte-cap, fetches the SAME url ONCE, and reads location
// off the SAME json payload per vendor: greenhouse location.name · lever
// categories.location (matched by posting id) · ashby location/locationName
// (matched by posting id) · workday jobPostingInfo.location.
//
// lever/ashby's matched posting id isn't exposed by atsDescriptionUrl's `pick`
// closure, so it's re-derived here from the SAME link-path segment (segs[1])
// atsDescriptionUrl itself reads for those two vendors.
// note: keep in sync if that routing ever changes (tests/jd-snapshot.test.ts
// covers both). D-ldjson: a page-fetch (no ATS route) now CAN yield a location
// too, via captureJobPosting's ld+json branch below; only a page with neither
// a vendor API nor a JobPosting ld+json still forces the caller (lib/role-jd.ts)
// to fall back to captureJobDescription and accept location: null. Never throws.
function pickLocation(vendor: JdVendor, json: unknown, role: { link: string | null }): string | null {
  if (vendor === "greenhouse") return str(rec(rec(json)?.location)?.name);
  if (vendor === "workday") return str(rec(rec(json)?.jobPostingInfo)?.location);
  const segs = parseHttp(role.link)?.pathname.split("/").filter(Boolean) ?? [];
  const id = segs[1];
  if (!id) return null;
  if (vendor === "lever") {
    const arr = Array.isArray(json) ? json : [];
    return str(rec(rec(arr.find((j) => rec(j)?.id === id))?.categories)?.location);
  }
  if (vendor === "ashby") {
    const jobs = rec(json)?.jobs;
    const job = rec(Array.isArray(jobs) ? jobs.find((j) => rec(j)?.id === id) : null);
    return str(job?.location) ?? str(job?.locationName);
  }
  return null;
}

// ATS-first capture: one fetch of the vendor API, sanitized+capped HTML the
// same way captureJobDescription's "ats" branch does, plus the location.
// D-ldjson: when role.link has no vendor API (the common "other" case, ~40% of
// open roles), this now tries ONE page fetch for the JobPosting ld+json
// instead of returning immediately — the only source of a JSON-shaped
// `location` on that path (captureJobDescription's whole-page fallback has
// none). A miss (no ld+json, or a description too thin to trust — `ok` false)
// returns {html:null, error:"no ats route"} so the caller falls back to
// captureJobDescription for html, keeping this `location` if one was found.
// Never throws.
export async function captureJobPosting(
  role: { id: string; link: string | null; source: string | null },
  company: { ats: string | null; endpoint: string | null; name?: string | null },
  opts: { fetch: typeof fetch; timeoutMs?: number; endpoints?: Endpoint[] },
): Promise<{ html: string | null; location: string | null; error: string | null }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const plan = atsDescriptionUrl(company, role, opts.endpoints ?? []);
  if (!plan) {
    const link = parseHttp(role.link);
    if (!link) return { html: null, location: null, error: "no ats route" };
    try {
      const raw = await fetchWithTimeout(opts.fetch, link.href, timeoutMs, (res) => res.text());
      const ld = ldJsonHtml(raw);
      if (!ld) return { html: null, location: null, error: "no ats route" };
      return ld.ok ? { html: ld.html, location: ld.location, error: null } : { html: null, location: ld.location, error: "no ats route" };
    } catch {
      return { html: null, location: null, error: "no ats route" };
    }
  }
  try {
    const json = await fetchWithTimeout(opts.fetch, plan.url, timeoutMs, (res) => res.json());
    const location = pickLocation(plan.vendor, json, role);
    const raw = plan.pick(json);
    if (raw === null) return { html: null, location, error: "no description field" };
    const html = capBytes(sanitizeJobHtml(raw));
    return html.trim() ? { html, location, error: null } : { html: null, location, error: "empty after sanitize" };
  } catch (e) {
    return { html: null, location: null, error: errMsg(e) };
  }
}
