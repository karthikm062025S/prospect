import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizeJobHtml,
  decodeEntitiesOnce,
  atsDescriptionUrl,
  captureJobDescription,
  captureJobPosting,
  extractJobPostingLdJson,
  JD_SNAPSHOT_MAX_BYTES,
  JD_RAW_MAX,
  JD_LDJSON_MIN_BYTES,
  capBytesStats,
  type Endpoint,
} from "../lib/jd-snapshot.ts";

// The sanitizer is the trust boundary (TRD §6, §9a): untrusted employer HTML is
// rendered into the gate-holder's session with dangerouslySetInnerHTML. These
// fixtures are the proof. Every sanitized output goes through assertSafe(),
// which allows ONLY the exact tag forms the contract permits and proves the
// tags are balanced, so no bypass can hide in an unasserted corner.

const here = dirname(fileURLToPath(import.meta.url));
const readFx = (name: string) => readFile(join(here, "fixtures", "jd", name), "utf8");
const readJson = async (name: string) => JSON.parse(await readFx(name)) as unknown;

const OPEN = /^<(h[1-4]|p|ul|ol|li|strong|em)>$/;
const CLOSE = /^<\/(h[1-4]|p|ul|ol|li|strong|em|a)>$/;
const BR = /^<br>$/;
const ANCHOR = /^<a href="https?:\/\/[^"\s<>]+" rel="noopener noreferrer" target="_blank">$/;

// Every "<" in the output must start one of the four exact tag forms above; the
// tags must be balanced; no other markup can exist by construction.
function assertSafe(out: string, label = "output") {
  const stack: string[] = [];
  let i = 0;
  const re = /<[^>]*>|<|>/g;
  for (const m of out.matchAll(re)) {
    const tag = m[0];
    assert.notEqual(tag, "<", `${label}: bare "<" survived at ${m.index}`);
    assert.notEqual(tag, ">", `${label}: bare ">" survived at ${m.index}`);
    if (BR.test(tag)) continue;
    if (OPEN.test(tag) || ANCHOR.test(tag)) {
      stack.push(tag.match(/^<([a-z0-9]+)/)![1]);
    } else if (CLOSE.test(tag)) {
      const name = tag.match(/^<\/([a-z0-9]+)/)![1];
      assert.equal(stack.pop(), name, `${label}: unbalanced close ${tag} at ${m.index}`);
    } else {
      assert.fail(`${label}: disallowed tag ${JSON.stringify(tag)} at ${m.index}`);
    }
    i++;
  }
  assert.deepEqual(stack, [], `${label}: tags left open ${stack.join(",")}`);
  // Belt and braces: the classic bypass strings never appear in any form.
  assert.doesNotMatch(out, /<\s*(script|style|iframe|svg|img|object|embed|form|input|meta|link|title|base|math)\b/i, label);
  assert.doesNotMatch(out, /\son[a-z]+\s*=/i, `${label}: event handler attribute`);
  assert.doesNotMatch(out, /href="(?!https?:)/i, `${label}: non-http href`);
  assert.doesNotMatch(out, /href="[^"]*(javascript|vbscript|data):/i, `${label}: dangerous scheme in href`);
  return i;
}

// ---------------------------------------------------------------- sanitizer --

test("sanitize: allowlist positives keep exactly h1-h4/p/ul/ol/li/strong/em/br/a[href]", () => {
  const out = sanitizeJobHtml(
    '<h1>T1</h1><h2>T2</h2><h3>T3</h3><h4>T4</h4><p>a <strong>b</strong> <em>c</em><br>d</p><ul><li>u</li></ul><ol><li>o</li></ol><a href="https://ok.example/">l</a>',
  );
  assert.equal(
    out,
    '<h1>T1</h1><h2>T2</h2><h3>T3</h3><h4>T4</h4><p>a <strong>b</strong> <em>c</em><br>d</p><ul><li>u</li></ul><ol><li>o</li></ol><p><a href="https://ok.example/" rel="noopener noreferrer" target="_blank">l</a></p>',
  );
  assertSafe(out);
});

test("sanitize: b/i map to strong/em (RB-015 'bold kept'); h5/h6 map to h4 (D25: the outline survives)", () => {
  assert.equal(sanitizeJobHtml("<p>Hi <b>bold</b> <i>it</i></p><h5>x</h5>"), "<p>Hi <strong>bold</strong> <em>it</em></p><h4>x</h4>");
  assert.equal(sanitizeJobHtml("<h6>deep</h6>"), "<h4>deep</h4>");
});

test("sanitize: all attributes are stripped from allowed tags (style, class, id, data-*, on*)", () => {
  const out = sanitizeJobHtml('<p onclick="x" style="color:red" class="c" id="i" data-x="1">t</p><ul style="a"><li class="b">u</li></ul>');
  assert.equal(out, "<p>t</p><ul><li>u</li></ul>");
});

test("sanitize: inline wrappers (span, code) are stripped and their text joins the run", () => {
  assert.equal(sanitizeJobHtml("<p>Hello <span>big</span> <code>world</code>!</p>"), "<p>Hello big world!</p>");
});

// D25 — the run-on bug. Every structural wrapper is a BLOCK BOUNDARY.
test("sanitize(D25): div/section wrappers become paragraph breaks, never one run-on block", () => {
  assert.equal(sanitizeJobHtml('<div class="x"><span>text</span> <section>more</section></div>'), "<p>text</p><p>more</p>");
  assert.equal(sanitizeJobHtml("<div>A</div><div>B</div>"), "<p>A</p><p>B</p>");
});

test("sanitize(D25): every listed block element is a boundary, opening AND closing", () => {
  for (const t of [
    "div", "section", "article", "header", "footer", "main", "aside",
    "table", "thead", "tbody", "tr", "td", "th",
    "blockquote", "pre", "dl", "dt", "dd",
    "figure", "figcaption", "form", "fieldset", "nav",
  ]) {
    const out = sanitizeJobHtml(`<${t}>A</${t}><${t}>B</${t}>`);
    assert.equal(out, "<p>A</p><p>B</p>", `block ${t}`);
    assertSafe(out, t);
  }
  // hr is void: the open tag alone is the boundary
  assert.equal(sanitizeJobHtml("<p>A<hr>B</p>"), "<p>A</p><p>B</p>");
  // a heading or li cannot hold a <p>, so the boundary becomes a <br>
  assert.equal(sanitizeJobHtml("<li><div>a</div><div>b</div></li>"), "<li>a<br>b</li>");
  assert.equal(sanitizeJobHtml("<h2><div>a</div><div>b</div></h2>"), "<h2>a<br>b</h2>");
});

test("sanitize(D25): a heading is never swallowed into the paragraph next to it", () => {
  const out = sanitizeJobHtml("<div><div><h2>A World-Changing Company</h2></div><div>Palantir builds software.</div></div>");
  assert.equal(out, "<h2>A World-Changing Company</h2><p>Palantir builds software.</p>");
  assertSafe(out);
});

test("sanitize(D25): whitespace-only runs between blocks emit nothing; no empty <p></p> is ever produced", () => {
  assert.equal(sanitizeJobHtml("<div>   </div>\n<div>A</div>  \t <div>B</div>"), "<p>A</p><p>B</p>");
  assert.equal(sanitizeJobHtml("<div></div><div><span> </span></div>"), "");
  assert.equal(sanitizeJobHtml("<p></p><p>  </p><p>x</p>"), "<p>x</p>");
  assert.equal(sanitizeJobHtml("<ul><li></li><li>x</li></ul>"), "<ul><li>x</li></ul>");
  assert.doesNotMatch(sanitizeJobHtml("<div><div><div>a</div></div></div><div> </div><div>b</div>"), /<p><\/p>/);
  // and whitespace INSIDE a run is still collapsed to one space
  assert.equal(sanitizeJobHtml("<div>a \n\t b</div>"), "<p>a b</p>");
});

test("sanitize: script/style/iframe/textarea/title/noscript contents are DROPPED, not rendered as text", () => {
  assert.equal(sanitizeJobHtml("<script>alert(1)</script>after"), "<p>after</p>");
  assert.equal(sanitizeJobHtml("<style>.x{}</style>after"), "<p>after</p>");
  assert.equal(sanitizeJobHtml('<iframe src="https://e.example">fb</iframe>after'), "<p>after</p>");
  assert.equal(sanitizeJobHtml("<textarea><script>x</script></textarea>after"), "<p>after</p>");
  assert.equal(sanitizeJobHtml("<title>t</title>after"), "<p>after</p>");
  assert.equal(sanitizeJobHtml("<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></noscript>after"), '<p>"&gt;after</p>');
  assert.equal(sanitizeJobHtml("<script>unterminated"), "");
});

test("sanitize: script tag-name and close-tag variants (case, /xss, spaced close)", () => {
  assert.equal(sanitizeJobHtml("<ScRiPt>alert(1)</sCrIpT>ok"), "<p>ok</p>");
  assert.equal(sanitizeJobHtml('<script/xss src="https://e.example/x.js"></script>ok'), "<p>ok</p>");
  assert.equal(sanitizeJobHtml("<script>alert(1)</script >ok"), "<p>ok</p>");
  assert.equal(sanitizeJobHtml("<script>alert(1)</script/>ok"), "<p>ok</p>");
});

test("sanitize: svg foreign content (svg>script, svg>style>img) never leaks a tag", () => {
  const out = sanitizeJobHtml("<svg><script>alert('svg')</script></svg><svg><style><img src=x onerror=alert(1)></style></svg>ok");
  assert.equal(out, "<p>ok</p>");
});

test("sanitize: comments are dropped incl. the <!--> and --!> tricks", () => {
  assert.equal(sanitizeJobHtml("<!-- c --><p>a</p>"), "<p>a</p>");
  assert.equal(sanitizeJobHtml("<!--><script>alert(1)</script><p>a</p>"), "<p>a</p>");
  assert.equal(sanitizeJobHtml("<!-- x --!><p>b</p>"), "<p>b</p>");
  assert.equal(sanitizeJobHtml("<!-- <script>alert(1)</script> --><p>c</p>"), "<p>c</p>");
  assert.equal(sanitizeJobHtml("<!-- unterminated <p>d</p>"), "");
  assert.equal(sanitizeJobHtml("<!DOCTYPE html><?xml x?><![CDATA[<script>]]><p>e</p>"), "<p>]]&gt;</p><p>e</p>");
});

test("sanitize: entities in text stay encoded, bare < > & are escaped, so &lt;script&gt; can never re-form a tag", () => {
  const out = sanitizeJobHtml("<p>&lt;script&gt;alert(1)&lt;/script&gt; 1 &lt; 2 &amp; 3 > 2 & a < b &copy; &#39; &#x27;</p>");
  assert.equal(out, "<p>&lt;script&gt;alert(1)&lt;/script&gt; 1 &lt; 2 &amp; 3 &gt; 2 &amp; a &lt; b &copy; &#39; &#x27;</p>");
  assertSafe(out);
});

test("sanitize: nested <p><p> and unclosed tags come out balanced", () => {
  assert.equal(sanitizeJobHtml("<p><p>a</p>"), "<p>a</p>"); // the empty opener collapses (D25)
  assert.equal(sanitizeJobHtml("<h3>Unclosed"), "<h3>Unclosed</h3>");
  assert.equal(sanitizeJobHtml("<ul><li>a<li>b</ul>"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(sanitizeJobHtml("<p>a</p></p></li>b"), "<p>a</p><p>b</p>");
  assert.equal(sanitizeJobHtml("<strong>x<p>y"), "<p><strong>x</strong></p><p>y</p>");
});

test("sanitize: br variants normalize to <br>; </br> is dropped; whitespace runs collapse", () => {
  assert.equal(sanitizeJobHtml("<p>a<br/><br />b</p></br>"), "<p>a<br><br>b</p>");
  assert.equal(sanitizeJobHtml("<p>a\n\n   b\t c</p>"), "<p>a b c</p>");
});

test("sanitize: href kept only when it parses as absolute http(s); anchor degrades to text otherwise", () => {
  // an anchor is phrasing content: at top level it now gets the implicit <p> (D25)
  const keep = (h: string) => sanitizeJobHtml(`<a href="${h}">t</a>`);
  assert.equal(keep("HTTPS://Example.com/x"), '<p><a href="https://example.com/x" rel="noopener noreferrer" target="_blank">t</a></p>');
  assert.equal(keep("http://ok.example/a b"), '<p><a href="http://ok.example/a%20b" rel="noopener noreferrer" target="_blank">t</a></p>');
  assert.equal(keep("https://ok.example/q?a=1&amp;b=2"), '<p><a href="https://ok.example/q?a=1&amp;b=2" rel="noopener noreferrer" target="_blank">t</a></p>');
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "//evil.example/x",
    "/relative",
    "relative.html",
    "mailto:a@b.c",
    "ftp://x.example/",
    "&#106;avascript:alert(1)",
    "&#x6A;avascript:alert(1)",
    "java&#9;script:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "  javascript:alert(1)",
    "\u0001javascript:alert(1)", // leading C0 control: URL parsers strip it → javascript:
    "",
  ]) {
    assert.equal(keep(bad), "<p>t</p>", `href ${JSON.stringify(bad)} must degrade to text`);
  }
  // WHATWG parses a host-less "https:evil" as https://evil/ — absolute https, so it is kept in normalized form.
  assert.equal(keep("https:evil"), '<p><a href="https://evil/" rel="noopener noreferrer" target="_blank">t</a></p>');
});

test("sanitize: href attribute syntax variants (unquoted, single-quoted, spaces around =, duplicate → first wins, no value)", () => {
  assert.equal(sanitizeJobHtml("<a href=javascript:alert(1)>t</a>"), "<p>t</p>");
  assert.equal(sanitizeJobHtml("<a href='javascript:alert(1)'>t</a>"), "<p>t</p>");
  assert.equal(sanitizeJobHtml("<a href = 'https://ok.example/'>t</a>"), '<p><a href="https://ok.example/" rel="noopener noreferrer" target="_blank">t</a></p>');
  assert.equal(sanitizeJobHtml('<a href="https://ok.example/first" href="javascript:alert(1)">t</a>'), '<p><a href="https://ok.example/first" rel="noopener noreferrer" target="_blank">t</a></p>');
  assert.equal(sanitizeJobHtml('<a href="javascript:alert(1)" href="https://ok.example/second">t</a>'), "<p>t</p>");
  assert.equal(sanitizeJobHtml("<a href>t</a>"), "<p>t</p>");
  assert.equal(sanitizeJobHtml("<a>t</a>"), "<p>t</p>");
  assert.equal(sanitizeJobHtml('<a/href="https://ok.example/">t</a>'), '<p><a href="https://ok.example/" rel="noopener noreferrer" target="_blank">t</a></p>');
});

test("sanitize: kept anchors carry exactly href + rel + target; every other attribute is dropped", () => {
  const out = sanitizeJobHtml('<a href="https://ok.example/a" onmouseover="x" target="_top" rel="opener" download class="c">ok</a>');
  assert.equal(out, '<p><a href="https://ok.example/a" rel="noopener noreferrer" target="_blank">ok</a></p>');
});

test("sanitize: a quote-injected href cannot break out of the attribute", () => {
  const out = sanitizeJobHtml('<a href="https://ok.example/a&quot;onmouseover=&quot;x">t</a>');
  assert.equal(out, '<p><a href="https://ok.example/a%22onmouseover=%22x" rel="noopener noreferrer" target="_blank">t</a></p>');
  assertSafe(out);
});

test("sanitize: nested anchors are split, never nested", () => {
  const out = sanitizeJobHtml('<a href="https://ok.example/o">outer <a href="https://ok.example/i">inner</a></a>');
  assert.equal(
    out,
    '<p><a href="https://ok.example/o" rel="noopener noreferrer" target="_blank">outer </a><a href="https://ok.example/i" rel="noopener noreferrer" target="_blank">inner</a></p>',
  );
  assertSafe(out);
});

test("sanitize: bare '<' that is not a tag start is escaped; unterminated tag is dropped", () => {
  assert.equal(sanitizeJobHtml("<p>1 < 2 <3 and < a</p>"), "<p>1 &lt; 2 &lt;3 and &lt; a</p>");
  assert.equal(sanitizeJobHtml("<p>x</p><a href='https://ok.example/"), "<p>x</p>");
});

test("sanitize: non-string / empty input yields empty string", () => {
  assert.equal(sanitizeJobHtml(""), "");
  assert.equal(sanitizeJobHtml(undefined as unknown as string), "");
});

// The page fixture: a full posting page with chrome and every bypass named.
test("sanitize(page.html): every XSS case, by name", async () => {
  const out = sanitizeJobHtml(await readFx("page.html"));
  assertSafe(out, "page.html");
  const has = (s: string) => assert.ok(out.includes(s), `expected ${JSON.stringify(s)} in output`);
  const not = (s: string) => assert.ok(!out.includes(s), `unexpected ${JSON.stringify(s)} in output`);
  // 1 script elements (head, inline state, document.write) + content
  not("<script"); not("__STATE__"); not("document.write"); not("track.js");
  // the ONLY surviving "alert(" is the entity-escaped inert text asserted in case 29
  assert.equal(out.match(/alert\(/g)?.length, 1);
  assert.doesNotMatch(out, /(?<!&gt;)alert\(/);
  // 2 style element + content, 3 inline style attribute
  not("<style"); not(".hero"); not("style=");
  // 4 event handlers: body onload, p onclick, img onerror, a onmouseover
  // attribute form only — the quote-injected case legitimately leaves "%22onmouseover=%22x" INSIDE a percent-encoded href path
  assert.doesNotMatch(out, /\son(load|click|error|mouseover)\s*=/);
  // 5 javascript: href → text
  has("javascript link"); not("javascript:");
  // 6 data: href → text
  has("data link"); not("data:");
  // 7 uppercase scheme kept + normalized
  has('<a href="https://example.com/x" rel="noopener noreferrer" target="_blank">uppercase scheme</a>');
  // 8 protocol-relative → text
  has("protocol-relative"); not("evil.example");
  // 9 ok link with handler → exact anchor
  has('<a href="https://ok.example/a" rel="noopener noreferrer" target="_blank">ok link with handler</a>');
  // 10-13 entity-encoded / tab-split / leading-whitespace / unquoted javascript: → text
  has("entity-encoded scheme"); has("tab-split scheme"); has("leading whitespace scheme"); has("unquoted javascript");
  // 14 duplicate href → first wins
  has('<a href="https://ok.example/first" rel="noopener noreferrer" target="_blank">duplicate href</a>');
  // 15 ampersand in query re-escaped
  has('<a href="https://ok.example/q?a=1&amp;b=2" rel="noopener noreferrer" target="_blank">ampersand in query</a>');
  // 16 quote-injected href stays inside the attribute
  has('<a href="https://ok.example/a%22onmouseover=%22x" rel="noopener noreferrer" target="_blank">quote-injected href</a>');
  // 17-18 relative + mailto → text
  has("relative link"); has("mailto link"); not("mailto:"); not('href="/');
  // 19-20 svg>script, svg>style>img
  not("<svg"); not("svg')");
  // 21 iframe + its fallback content
  not("<iframe"); not("iframe fallback text");
  // 22 img
  not("<img");
  // 23-25 ScRiPt, script/xss, spaced close
  not("mixed case"); not("x.js"); not("spaced close");
  // 26 comments: plain, <!--> empty-comment trick, script inside comment, --!> close
  not("plain comment"); not("empty comment"); not("in comment"); has("text after bang-close");
  // 27 noscript mXSS, 28 textarea raw text
  not("noscript"); not("textarea");
  // 29 entities stay text
  has("Entities stay text: &lt;script&gt;alert('entity')&lt;/script&gt; and 1 &lt; 2 and 3 &gt; 2 and a bare &lt; sign.");
  // 30 nested <p><p>
  has("<p>Nested paragraph opener (browsers auto-close the first).</p>");
  // 31 unclosed li / h3 are balanced (assertSafe) and content kept
  assert.match(out, /<li>Go\s*<\/li><\/ol>/); has("<h3>Unclosed heading");
  // 32 object/embed/form/input/math/meta/link/title/base
  not("<object"); not("<embed"); not("<form"); not("<input"); not("<math"); not("<meta"); not("<link"); not("<title"); not("Intern Posting");
  // 33 wrapper text survives
  has("Text inside stripped wrappers survives.");
  // 34 nested anchors split
  has('<a href="https://ok.example/outer" rel="noopener noreferrer" target="_blank">outer </a><a href="https://ok.example/inner" rel="noopener noreferrer" target="_blank">inner</a>');
  // 35 br variants + </br>
  has("Break variants:<br><br>done"); not("</br>");
  // 36 named entity preserved in chrome text
  has("&copy; Evil Corp");
  // positives
  has("<h1>Software Engineer Intern</h1>");
  has("<p>Join our <strong>team</strong> and build <em>great</em> things.<br>Remote OK.</p>");
  has("<h2>Requirements</h2>");
  // idempotent: re-sanitizing the output changes nothing (also what the 200 KB cap relies on)
  assert.equal(sanitizeJobHtml(out), out);
});

// ------------------------------------------------------------ entity decode --

test("decodeEntitiesOnce: decodes named, decimal and hex entities exactly once", () => {
  assert.equal(decodeEntitiesOnce("&lt;p&gt;x &amp;amp; y&lt;/p&gt;"), "<p>x &amp; y</p>");
  assert.equal(decodeEntitiesOnce("&quot;&#39;&#x27;&nbsp;&#65;&apos;"), "\"''\u00a0A'");
  assert.equal(decodeEntitiesOnce("&bogus; &amp"), "&bogus; &amp");
  assert.equal(decodeEntitiesOnce(""), "");
});

test("decodeEntitiesOnce + sanitize: a double-encoded &amp;lt;script&amp;gt; stays inert text", () => {
  const decoded = decodeEntitiesOnce("&lt;p&gt;&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;&lt;/p&gt;&lt;script&gt;alert(2)&lt;/script&gt;");
  assert.equal(decoded, "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><script>alert(2)</script>");
  const out = sanitizeJobHtml(decoded);
  assert.equal(out, "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  assertSafe(out);
});

// ------------------------------------------------------- ld+json JobPosting --

const jobPostingScript = (obj: unknown, attrs = ' type="application/ld+json"') => `<script${attrs}>${JSON.stringify(obj)}</script>`;
const CHROME = '<html><head><title>Careers</title></head><body><nav><a href="/">Home</a></nav>';
const FOOTER = "<footer>Cookies &amp; Privacy</footer></body></html>";
const bigDesc = (n = 60) => Array.from({ length: n }, (_, i) => `<p>Paragraph ${i} of the real posting body.</p>`).join("");

test("extractJobPostingLdJson: single object, description + jobLocation.address + dates", () => {
  const posting = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    description: bigDesc(),
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Austin", addressRegion: "TX" } },
    datePosted: "2026-08-01",
    validThrough: "2026-12-01",
  };
  const html = CHROME + jobPostingScript(posting) + FOOTER;
  const r = extractJobPostingLdJson(html);
  assert.ok(r);
  assert.ok(r.description.includes("Paragraph 0"));
  assert.equal(r.location, "Austin, TX");
  assert.equal(r.datePosted, "2026-08-01");
  assert.equal(r.validThrough, "2026-12-01");
});

test("extractJobPostingLdJson: array of nodes picks the one whose @type is (or contains) JobPosting", () => {
  const arr = [
    { "@type": "BreadcrumbList" },
    { "@type": ["Thing", "JobPosting"], description: bigDesc() },
  ];
  const r = extractJobPostingLdJson(CHROME + jobPostingScript(arr) + FOOTER);
  assert.ok(r);
  assert.ok(r.description.includes("Paragraph 0"));
});

test("extractJobPostingLdJson: @graph wrapper", () => {
  const doc = { "@context": "https://schema.org", "@graph": [{ "@type": "Organization" }, { "@type": "JobPosting", description: bigDesc() }] };
  const r = extractJobPostingLdJson(jobPostingScript(doc));
  assert.ok(r);
  assert.ok(r.description.includes("Paragraph 0"));
});

test("extractJobPostingLdJson: WebPage.mainEntity nesting", () => {
  const doc = { "@type": "WebPage", mainEntity: { "@type": "JobPosting", description: bigDesc() } };
  const r = extractJobPostingLdJson(jobPostingScript(doc));
  assert.ok(r);
  assert.ok(r.description.includes("Paragraph 0"));
});

test("extractJobPostingLdJson: no ld+json script → null; a JobPosting with no description → null", () => {
  assert.equal(extractJobPostingLdJson(CHROME + FOOTER), null);
  assert.equal(extractJobPostingLdJson(jobPostingScript({ "@type": "JobPosting" })), null);
  assert.equal(extractJobPostingLdJson(jobPostingScript({ "@type": "JobPosting", description: "" })), null);
});

test("extractJobPostingLdJson: malformed JSON in one block is skipped safely, scanning continues", () => {
  const bad = '<script type="application/ld+json">{not: valid json,,,</script>';
  const good = jobPostingScript({ "@type": "JobPosting", description: bigDesc() });
  const r = extractJobPostingLdJson(bad + good);
  assert.ok(r);
  assert.ok(r.description.includes("Paragraph 0"));
  // only a bad block, nothing valid anywhere → null, never throws
  assert.equal(extractJobPostingLdJson(bad), null);
});

test("extractJobPostingLdJson: type attribute is case-insensitive, single-quoted, and order-independent", () => {
  const posting = { "@type": "JobPosting", description: bigDesc() };
  const variants = [
    ` type="APPLICATION/LD+JSON"`,
    ` type='application/ld+json'`,
    ` id="x" type="application/ld+json" data-y="1"`,
    ` data-y="1" type="application/ld+json"`,
  ];
  for (const attrs of variants) {
    const r = extractJobPostingLdJson(jobPostingScript(posting, attrs));
    assert.ok(r, attrs);
    assert.ok(r.description.includes("Paragraph 0"), attrs);
  }
  // a script with a DIFFERENT type is not treated as ld+json
  assert.equal(extractJobPostingLdJson(`<script type="text/javascript">${JSON.stringify(posting)}</script>`), null);
});

test("extractJobPostingLdJson: jobLocation as an array uses the first entry with a real address", () => {
  const posting = {
    "@type": "JobPosting",
    description: bigDesc(),
    jobLocation: [{ "@type": "Place", address: {} }, { "@type": "Place", address: { addressLocality: "Remote" } }],
  };
  assert.equal(extractJobPostingLdJson(jobPostingScript(posting))?.location, "Remote");
});

test("extractJobPostingLdJson: empty address fields fall back to applicantLocationRequirements.name", () => {
  const posting = {
    "@type": "JobPosting",
    description: bigDesc(),
    jobLocation: { "@type": "Place", address: { addressLocality: "", addressRegion: null } },
    applicantLocationRequirements: { "@type": "Country", name: "United States" },
  };
  assert.equal(extractJobPostingLdJson(jobPostingScript(posting))?.location, "United States");
  // no jobLocation and no applicantLocationRequirements at all → null, not thrown
  assert.equal(extractJobPostingLdJson(jobPostingScript({ "@type": "JobPosting", description: bigDesc() }))?.location, null);
});

test("extractJobPostingLdJson: description decoded exactly once (double-encoded stays inert)", () => {
  const posting = { "@type": "JobPosting", description: "&lt;p&gt;Hi&lt;/p&gt;&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;" };
  const r = extractJobPostingLdJson(jobPostingScript(posting));
  assert.equal(r?.description, "<p>Hi</p>&lt;script&gt;alert(1)&lt;/script&gt;");
  const out = sanitizeJobHtml(r!.description);
  assert.equal(out, "<p>Hi</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  assertSafe(out, "ldjson double-encoded");
});

test("capture(page, ld+json): a career page's JobPosting description is used INSTEAD of the whole page, chrome excluded", async () => {
  const posting = { "@type": "JobPosting", description: bigDesc(), jobLocation: { address: { addressLocality: "Denver", addressRegion: "CO" } } };
  const page = CHROME + jobPostingScript(posting) + FOOTER;
  const { fetchFn, calls } = fakeFetch(() => html(page));
  const r = await captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: fetchFn, now: NOW });
  assert.ok(r);
  assert.equal(r.via, "page");
  assert.equal(calls.length, 1);
  assert.ok(r.html.includes("Paragraph 0"));
  assert.doesNotMatch(r.html, /Cookies|Careers|Home/);
  assertSafe(r.html, "ldjson page");
});

test("capture(page, ld+json): no ld+json on the page → whole-page snapshot, unchanged from today", async () => {
  const page = await readFx("page.html");
  const { fetchFn } = fakeFetch(() => html(page));
  const r = await captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: fetchFn, now: NOW });
  assert.ok(r);
  assert.equal(r.via, "page");
  assert.ok(r.html.includes("<h1>Software Engineer Intern</h1>"));
  assert.ok(r.html.includes("<h2>Requirements</h2>"));
});

test("capture(page, ld+json): a description too thin (< JD_LDJSON_MIN_BYTES sanitized) falls back to the whole page", async () => {
  assert.equal(JD_LDJSON_MIN_BYTES, 200);
  const posting = { "@type": "JobPosting", description: "<p>Tiny.</p>" };
  const page = CHROME + jobPostingScript(posting) + '<main><h1>Real Posting Title</h1><p>' + "x".repeat(300) + "</p></main>" + FOOTER;
  const { fetchFn } = fakeFetch(() => html(page));
  const r = await captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: fetchFn, now: NOW });
  assert.ok(r);
  assert.equal(r.via, "page");
  assert.ok(r.html.includes("Real Posting Title"), "fell back to the whole page, not the thin ld+json stub");
});

test("captureJobPosting: no ATS route, page has a JobPosting ld+json → html + location, no page-fallback fetch needed", async () => {
  const posting = { "@type": "JobPosting", description: bigDesc(), jobLocation: { address: { addressLocality: "Fairborn", addressRegion: "OH" } } };
  const page = CHROME + jobPostingScript(posting) + FOOTER;
  const { fetchFn, calls } = fakeFetch(() => html(page));
  const r = await captureJobPosting(PAGE_ROLE, noCo, { fetch: fetchFn });
  assert.equal(r.error, null);
  assert.equal(r.location, "Fairborn, OH");
  assert.ok(r.html?.includes("Paragraph 0"));
  assert.equal(calls.length, 1);
  assertSafe(r.html!, "captureJobPosting ldjson");
});

test("captureJobPosting: no ATS route, no ld+json (or too thin) → {html:null, error:\"no ats route\"}, location null when none found", async () => {
  const { fetchFn: f1 } = fakeFetch(() => html(CHROME + FOOTER));
  const r1 = await captureJobPosting(PAGE_ROLE, noCo, { fetch: f1 });
  assert.deepEqual(r1, { html: null, location: null, error: "no ats route" });

  const thin = { "@type": "JobPosting", description: "<p>Tiny.</p>", jobLocation: { address: { addressLocality: "Reno", addressRegion: "NV" } } };
  const { fetchFn: f2 } = fakeFetch(() => html(CHROME + jobPostingScript(thin) + FOOTER));
  const r2 = await captureJobPosting(PAGE_ROLE, noCo, { fetch: f2 });
  assert.equal(r2.html, null);
  assert.equal(r2.location, "Reno, NV", "location surfaces even when the description itself is too thin to trust");
  assert.equal(r2.error, "no ats route");

  // fetch throws / non-200 / no link → same safe miss, never throws
  const { fetchFn: f3 } = fakeFetch(() => html("", 503));
  assert.deepEqual(await captureJobPosting(PAGE_ROLE, noCo, { fetch: f3 }), { html: null, location: null, error: "no ats route" });
  assert.deepEqual(await captureJobPosting({ id: "r", link: null, source: null }, noCo, { fetch: f1 }), { html: null, location: null, error: "no ats route" });
});

// ------------------------------------------------------------ vendor routing --

const noCo = { ats: null, endpoint: null };
const role = (link: string | null, source: string | null = "scanner") => ({ link, source });
const NV_EP: Endpoint = { company: "NVIDIA", ats: "workday", host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" };

test("atsDescriptionUrl: greenhouse per-job ?content=true from either board host; pick decodes `content` once", async () => {
  const r = atsDescriptionUrl(noCo, role("https://job-boards.greenhouse.io/stripe/jobs/8130725"), []);
  assert.ok(r);
  assert.equal(r.vendor, "greenhouse");
  assert.equal(r.url, "https://boards-api.greenhouse.io/v1/boards/stripe/jobs/8130725?content=true");
  const r2 = atsDescriptionUrl(noCo, role("https://boards.greenhouse.io/stripe/jobs/8130725?gh_jid=8130725"), []);
  assert.equal(r2?.url, r.url);
  const picked = r.pick(await readJson("greenhouse-content.json"));
  assert.ok(picked);
  assert.ok(picked.includes("<h2>About the team</h2>"), "decoded once → real tags");
  assert.ok(picked.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "double-encoded stays encoded after one decode");
  assert.ok(picked.includes("Hello &amp; welcome"));
  assert.equal(r.pick({ id: 1 }), null);
  assert.equal(r.pick("nope"), null);
  assert.equal(r.pick(null), null);
});

test("atsDescriptionUrl: greenhouse EMBEDDED board (company site + ?gh_jid=) resolves the token by company name from endpoints", () => {
  // Ground truth 2026-08-23: 32 live roles link to an embedded board (e.g. samsara.com/...?gh_jid=), 26 of them
  // with a company name that exactly matches an endpoints.json greenhouse entry.
  const link = "https://www.samsara.com/company/careers/roles/8082091?gh_jid=8082091";
  const eps: Endpoint[] = [{ company: "samsara", ats: "greenhouse", token: "samsara-board" }];
  const r = atsDescriptionUrl({ ats: null, endpoint: null, name: "Samsara" }, role(link), eps);
  assert.equal(r?.vendor, "greenhouse");
  assert.equal(r?.url, "https://boards-api.greenhouse.io/v1/boards/samsara-board/jobs/8082091?content=true");
  // No endpoints match (no name, wrong name, wrong ats): fall back to the host's
  // own label as the board token — verified live for careers.roblox.com and
  // epicgames.com. A wrong guess 404s on the fixed API host → page fetch.
  const guessed = "https://boards-api.greenhouse.io/v1/boards/samsara/jobs/8082091?content=true";
  assert.equal(atsDescriptionUrl({ ats: null, endpoint: null }, role(link), eps)?.url, guessed);
  assert.equal(atsDescriptionUrl({ ats: null, endpoint: null, name: "Other Co" }, role(link), eps)?.url, guessed);
  assert.equal(atsDescriptionUrl({ ats: null, endpoint: null, name: "Samsara" }, role(link), [{ company: "samsara", ats: "lever", token: "x" }])?.url, guessed);
  assert.equal(
    atsDescriptionUrl({ ats: null, endpoint: null }, role("https://careers.roblox.com/jobs/8072713?gh_jid=8072713"), [])?.url,
    "https://boards-api.greenhouse.io/v1/boards/roblox/jobs/8072713?content=true",
  );
  // a non-numeric gh_jid is never routed (the path segment must stay ours)
  assert.equal(atsDescriptionUrl({ ats: null, endpoint: null, name: "Samsara" }, role("https://www.samsara.com/x?gh_jid=abc"), eps), null);
  // nothing but a public suffix to guess from
  assert.equal(atsDescriptionUrl({ ats: null, endpoint: null }, role("https://careers.io/x?gh_jid=1"), []), null);
});

test("atsDescriptionUrl: lever composes description + lists[] + additional (A9), never descriptionPlain", async () => {
  const r = atsDescriptionUrl(noCo, role("https://jobs.lever.co/palantir/d7fb089c-db8a-4877-a5f3-73a09e67f54b/apply"), []);
  assert.ok(r);
  assert.equal(r.vendor, "lever");
  assert.equal(r.url, "https://api.lever.co/v0/postings/palantir?mode=json");
  const picked = r.pick(await readJson("lever-posting.json"));
  assert.ok(picked?.includes("<h3>Palantir Internship</h3>"));
  assert.ok(!picked?.includes("WRONG POSTING"), "the decoy posting's fields never leak");
  // A9: `description` alone is the intro; lists[] and `additional` are the body.
  assert.ok(picked?.includes("<h3>What we look for</h3>"), "list heading");
  assert.ok(picked?.includes("<li>Curiosity</li>"), "list content");
  assert.ok(picked?.includes("equal opportunity employer"), "additional");
  assert.ok(!picked?.includes("You will build real things"), "never descriptionPlain");
  // order: intro, then each list in posting order, then additional
  assert.ok(picked!.indexOf("Palantir Internship") < picked!.indexOf("What we look for"));
  assert.ok(picked!.indexOf("What we look for") < picked!.indexOf("Nice to have"));
  assert.ok(picked!.indexOf("Nice to have") < picked!.indexOf("equal opportunity"));
  // a list heading is untrusted text: the sanitizer, not the composer, makes it safe
  const out = sanitizeJobHtml(picked!);
  assertSafe(out, "lever composed");
  assert.ok(!out.includes("alert(1)"));
  assert.equal(r.pick([]), null);
  assert.equal(r.pick({ description: "<p>x</p>" }), null);
  assert.equal(r.pick([{ id: "d7fb089c-db8a-4877-a5f3-73a09e67f54b" }]), null, "a posting with no text at all is a miss");
});

test("atsDescriptionUrl: ashby board list; pick matches jobs[].id and reads `descriptionHtml`", async () => {
  const r = atsDescriptionUrl(noCo, role("https://jobs.ashbyhq.com/snowflake/3d0a7c6e-4c1f-4b6e-9d1a-0f2b3c4d5e6f"), []);
  assert.ok(r);
  assert.equal(r.vendor, "ashby");
  assert.equal(r.url, "https://api.ashbyhq.com/posting-api/job-board/snowflake?includeCompensation=false");
  const picked = r.pick(await readJson("ashby-board.json"));
  assert.ok(picked?.includes("<h1>Snowflake Intern</h1>"));
  assert.ok(!picked?.includes("WRONG POSTING"));
  assert.equal(r.pick({ jobs: [] }), null);
  assert.equal(r.pick({}), null);
});

test("atsDescriptionUrl: workday CXS GET built from the link's host/site/externalPath; tenant from endpoints, else host label", async () => {
  const link = "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Software-Engineering-Intern_JR2021277?q=JR2021277&utm_source=x";
  const r = atsDescriptionUrl(noCo, role(link), [NV_EP]);
  assert.ok(r);
  assert.equal(r.vendor, "workday");
  assert.equal(r.url, "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Software-Engineering-Intern_JR2021277");
  // endpoints wins over the host label when it disagrees
  const r2 = atsDescriptionUrl(noCo, role(link), [{ ...NV_EP, tenant: "nvidiacorp" }]);
  assert.equal(r2?.url, "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidiacorp/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Software-Engineering-Intern_JR2021277");
  // /details/ shape (feed links) and the no-locale shape (career-site links)
  assert.equal(
    atsDescriptionUrl(noCo, role("https://boeing.wd1.myworkdayjobs.com/en-US/EXTERNAL_CAREERS/details/Data-Analytics-Intern_JR2026520976-1?q=JR2026520976"), [])?.url,
    "https://boeing.wd1.myworkdayjobs.com/wday/cxs/boeing/EXTERNAL_CAREERS/details/Data-Analytics-Intern_JR2026520976-1",
  );
  assert.equal(
    atsDescriptionUrl(noCo, role("https://vanguard.wd5.myworkdayjobs.com/contractors_restricted/job/Malvern-PA/College-to-Corporate-IT-Internship_177680"), [])?.url,
    "https://vanguard.wd5.myworkdayjobs.com/wday/cxs/vanguard/contractors_restricted/job/Malvern-PA/College-to-Corporate-IT-Internship_177680",
  );
  // no externalPath → nothing to fetch
  assert.equal(atsDescriptionUrl(noCo, role("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite"), [NV_EP]), null);
  const picked = r.pick(await readJson("workday-detail.json"));
  assert.ok(picked?.includes("<h4>What you'll be doing:</h4>"));
  assert.equal(r.pick({ jobPostingInfo: {} }), null);
  assert.equal(r.pick({}), null);
});

test("atsDescriptionUrl: oracle Candidate Experience CE REST GET built from the link's host/site/job id", async () => {
  const link = "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26011784";
  const r = atsDescriptionUrl(noCo, role(link), []);
  assert.ok(r);
  assert.equal(r.vendor, "oracle");
  assert.equal(
    r.url,
    "https://egug.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById%3BId%3D26011784%2CsiteNumber%3DCX_1",
  );
  const picked = r.pick(await readJson("real-oracle-ce.json"));
  assert.ok(picked?.includes("Business Unit/Role Specific Information"), "ExternalDescriptionStr");
  assert.ok(picked?.includes("American Express"), "CorporateDescriptionStr");
  assert.equal(r.pick({ items: [] }), null);
  assert.equal(r.pick({ items: [{ Title: "no body" }] }), null);
  assert.equal(r.pick({}), null);
  // shapes that are not a CE job detail stay on the page path
  for (const bad of [
    "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1",
    "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions/preview/26011784",
    "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/not-a-number",
    "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/../job/1",
  ])
    assert.equal(atsDescriptionUrl(noCo, role(bad), []), null, bad);
});

test("atsDescriptionUrl: vendors without an API description, unknown hosts, bad links → null (page-fetch path)", () => {
  for (const link of [
    "https://jobs.smartrecruiters.com/Acme/123",
    "https://www.amazon.jobs/en/jobs/123",
    "https://careers.co/jobs/1?gh_jid=123", // nothing but a public suffix to guess a board token from
    "https://lifeattiktok.com/search/7669683639101884725",
    "https://jobs.lever.co/palantir",
    "https://jobs.ashbyhq.com/snowflake",
    "https://job-boards.greenhouse.io/stripe",
    "https://evil.example/jobs.lever.co/x/y",
    "javascript:alert(1)",
    "not a url",
    null,
  ]) {
    assert.equal(atsDescriptionUrl({ ats: "greenhouse", endpoint: "greenhouse:stripe" }, role(link), []), null, `link ${link}`);
  }
});

// ------------------------------------------------------------------ capture --

type Call = { url: string; init: RequestInit | undefined };
function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fetchFn, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });
const NOW = () => new Date("2026-08-23T12:00:00.000Z");
const GH_ROLE = { id: "role-1", link: "https://job-boards.greenhouse.io/stripe/jobs/8130725", source: "scanner" };
const PAGE_ROLE = { id: "role-2", link: "https://careers.evil.example/jobs/1", source: "feed:simplify" };

async function captureErrors<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const orig = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    return { result: await fn(), lines };
  } finally {
    console.error = orig;
  }
}

function assertPlainFetch(call: Call) {
  // TRD §9(b): the outbound fetch carries the URL + browser-shaped headers and
  // NOTHING else — no cookie, no auth, no secret of ours.
  const h = new Headers(call.init?.headers ?? {});
  const names = [...h.keys()].map((k) => k.toLowerCase()).sort();
  assert.deepEqual(names, ["accept", "accept-language", "user-agent"], `unexpected headers: ${names.join(",")}`);
  assert.equal(call.init?.method ?? "GET", "GET");
  assert.equal(call.init?.body, undefined);
  assert.ok(call.init?.signal instanceof AbortSignal, "every fetch carries an AbortSignal");
}

test("capture: ATS-first (greenhouse) → decoded once, sanitized, via ats, captured_at from now()", async () => {
  const gh = await readJson("greenhouse-content.json");
  const { fetchFn, calls } = fakeFetch(() => json(gh));
  const { result, lines } = await captureErrors(() => captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: fetchFn, now: NOW }));
  assert.ok(result);
  assert.equal(result.via, "ats");
  assert.equal(result.captured_at, "2026-08-23T12:00:00.000Z");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://boards-api.greenhouse.io/v1/boards/stripe/jobs/8130725?content=true");
  assertPlainFetch(calls[0]);
  assertSafe(result.html, "greenhouse");
  assert.ok(result.html.includes("<h2>About the team</h2>"));
  assert.ok(result.html.includes("<p>Hello &amp; welcome to <strong>Stripe</strong>.</p>"));
  assert.ok(result.html.includes("<p>Literal text: &lt;script&gt;alert(1)&lt;/script&gt;</p>"));
  assert.ok(!result.html.includes("alert(2)"));
  assert.ok(result.html.includes('<a href="https://stripe.com/jobs" rel="noopener noreferrer" target="_blank">Stripe careers</a>'));
  assert.ok(!result.html.includes("steal"));
  assert.deepEqual(lines, []);
});

test("capture: lever / ashby / workday vendor paths each sanitize their own field", async () => {
  const cases: Array<[string, string, string, string]> = [
    ["lever-posting.json", "https://jobs.lever.co/palantir/d7fb089c-db8a-4877-a5f3-73a09e67f54b", "https://api.lever.co/v0/postings/palantir?mode=json", "<h3>Palantir Internship</h3><p>You will build <strong>real</strong> things with <em>real</em> data.</p>"],
    ["ashby-board.json", "https://jobs.ashbyhq.com/snowflake/3d0a7c6e-4c1f-4b6e-9d1a-0f2b3c4d5e6f", "https://api.ashbyhq.com/posting-api/job-board/snowflake?includeCompensation=false", "<h1>Snowflake Intern</h1><p>Build the <strong>Data Cloud</strong>.</p><ol><li>SQL</li><li>Rust</li></ol>"],
    ["workday-detail.json", "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Software-Engineering-Intern_JR2021277", "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Software-Engineering-Intern_JR2021277", "<h4>What you'll be doing:</h4><p>Work on <em>CUDA</em> kernels.</p><ul><li>C++</li><li>Python</li></ul>"],
  ];
  for (const [fx, link, apiUrl, expectStart] of cases) {
    const body = await readJson(fx);
    const { fetchFn, calls } = fakeFetch(() => json(body));
    const result = await captureJobDescription({ role: { id: "r", link, source: "scanner" }, company: noCo }, { fetch: fetchFn, now: NOW });
    assert.ok(result, fx);
    assert.equal(result.via, "ats", fx);
    assert.equal(calls[0].url, apiUrl, fx);
    assertPlainFetch(calls[0]);
    assertSafe(result.html, fx);
    assert.ok(result.html.startsWith(expectStart), `${fx}: ${result.html}`);
    assert.ok(!/WRONG|evil\.example|onerror|<iframe|javascript:/i.test(result.html), fx);
  }
  // lever: javascript link degraded to text, https link kept
  const lever = await captureJobDescription({ role: { id: "r", link: cases[0][1], source: "scanner" }, company: noCo }, { fetch: fakeFetch(async () => json(await readJson("lever-posting.json"))).fetchFn });
  assert.ok(lever?.html.includes('<a href="https://palantir.com/careers" rel="noopener noreferrer" target="_blank">Learn more</a> or click here.'));
  // workday: uppercase scheme normalized
  const wd = await captureJobDescription({ role: { id: "r", link: cases[2][1], source: "scanner" }, company: noCo }, { fetch: fakeFetch(async () => json(await readJson("workday-detail.json"))).fetchFn });
  assert.ok(wd?.html.includes('<a href="https://example.com/x" rel="noopener noreferrer" target="_blank">reach out</a>'));
});

test("capture: ATS non-200 → page fetch of roles.link through the SAME sanitizer, via page", async () => {
  const page = await readFx("page.html");
  const { fetchFn, calls } = fakeFetch((url) => (url.includes("boards-api") ? json({ error: "nope" }, 404) : html(page)));
  const { result, lines } = await captureErrors(() => captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: fetchFn, now: NOW }));
  assert.ok(result);
  assert.equal(result.via, "page");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, GH_ROLE.link);
  assertPlainFetch(calls[1]);
  assertSafe(result.html, "page via capture");
  assert.ok(result.html.includes("<h1>Software Engineer Intern</h1>"));
  assert.doesNotMatch(result.html, /(?<!&gt;)alert\(/);
  assert.deepEqual(lines, []);
});

test("capture: ATS 200 but unparseable / missing field → page fallback", async () => {
  const { fetchFn, calls } = fakeFetch((url) => (url.includes("boards-api") ? html("<html>not json") : html("<p>page</p>")));
  const r1 = await captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: fetchFn });
  assert.equal(r1?.via, "page");
  assert.equal(r1?.html, "<p>page</p>");
  assert.equal(calls.length, 2);
  const f2 = fakeFetch((url) => (url.includes("boards-api") ? json({ id: 1, title: "no content" }) : html("<p>page2</p>")));
  const r2 = await captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: f2.fetchFn });
  assert.equal(r2?.html, "<p>page2</p>");
});

test("capture: no ATS vendor → page fetch directly; page non-200 → null + one JSON error line", async () => {
  const { fetchFn, calls } = fakeFetch(() => html("<p>x</p>", 503));
  const { result, lines } = await captureErrors(() => captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: fetchFn }));
  assert.equal(result, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, PAGE_ROLE.link);
  assertPlainFetch(calls[0]);
  assert.equal(lines.length, 1);
  const line = JSON.parse(lines[0]);
  assert.equal(line.lane, "jd");
  assert.equal(line.role_id, "role-2");
  assert.match(String(line.error), /503/);
});

test("capture: ATS non-200 AND page non-200 → null, one error line naming both", async () => {
  const { fetchFn } = fakeFetch((url) => (url.includes("boards-api") ? json({}, 500) : html("", 404)));
  const { result, lines } = await captureErrors(() => captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: fetchFn }));
  assert.equal(result, null);
  assert.equal(lines.length, 1);
  const line = JSON.parse(lines[0]);
  assert.equal(line.role_id, "role-1");
  assert.match(String(line.error), /500/);
  assert.match(String(line.error), /404/);
});

test("capture: fetch that rejects or throws → null, never throws", async () => {
  const { fetchFn } = fakeFetch(() => { throw new TypeError("fetch failed"); });
  const { result, lines } = await captureErrors(() => captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: fetchFn }));
  assert.equal(result, null);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /fetch failed/);
  const rej = fakeFetch(() => Promise.reject(new Error("ECONNRESET")));
  const r2 = await captureErrors(() => captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: rej.fetchFn }));
  assert.equal(r2.result, null);
  assert.equal(r2.lines.length, 1);
});

test("capture: empty / non-http link and no vendor → null + error line, zero fetches", async () => {
  for (const link of [null, "", "javascript:alert(1)", "ftp://x.example/", "not a url"]) {
    const { fetchFn, calls } = fakeFetch(() => html("<p>x</p>"));
    const { result, lines } = await captureErrors(() => captureJobDescription({ role: { id: "r", link, source: null }, company: noCo }, { fetch: fetchFn }));
    assert.equal(result, null, String(link));
    assert.equal(calls.length, 0, String(link));
    assert.equal(lines.length, 1, String(link));
  }
});

test("capture: sanitizer yielding nothing is a failure (ATS empty → page; page empty → null)", async () => {
  const { fetchFn, calls } = fakeFetch((url) => (url.includes("boards-api") ? json({ content: "&lt;script&gt;x&lt;/script&gt;" }) : html("<script>x</script>   ")));
  const { result, lines } = await captureErrors(() => captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: fetchFn }));
  assert.equal(result, null);
  assert.equal(calls.length, 2);
  assert.equal(lines.length, 1);
});

test("capture: timeout → abort → null (fetch honors the signal) and null even when fetch ignores the signal", async () => {
  const honoring = fakeFetch((_url, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
  let t0 = Date.now();
  const a = await captureErrors(() => captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: honoring.fetchFn, timeoutMs: 10 }));
  assert.equal(a.result, null);
  assert.equal(honoring.calls.length, 2, "ATS timed out, then the page was tried");
  assert.ok(honoring.calls.every((c) => c.init?.signal?.aborted), "both signals fired");
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(a.lines.length, 1);
  assert.match(a.lines[0], /abort|timeout/i);

  const ignoring = fakeFetch(() => new Promise<Response>(() => {}));
  t0 = Date.now();
  const b = await captureErrors(() => captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: ignoring.fetchFn, timeoutMs: 10 }));
  assert.equal(b.result, null);
  assert.ok(Date.now() - t0 < 2000, "a fetch that never settles must not hang the capture");
  assert.equal(b.lines.length, 1);
});

test("capture: default timeout is 5000 ms (signal not aborted immediately)", async () => {
  const { fetchFn, calls } = fakeFetch(() => html("<p>x</p>"));
  await captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: fetchFn });
  assert.equal(calls[0].init?.signal?.aborted, false);
});

test("capture: sanitized HTML is capped at 200 KB, truncation is well-formed and noted", async () => {
  const enc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const big = Array.from({ length: 300 }, (_, i) => `<p>${String(i).padStart(3, "0")} ${"x".repeat(1000)} <a href="https://ok.example/${i}">l</a> &amp; é</p>`).join("");
  assert.ok(big.length > 300_000);
  const { fetchFn } = fakeFetch(() => json({ content: enc(big) }));
  const { result, lines } = await captureErrors(() => captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: fetchFn }));
  assert.ok(result);
  assert.equal(result.via, "ats");
  const bytes = new TextEncoder().encode(result.html).length;
  assert.ok(bytes <= JD_SNAPSHOT_MAX_BYTES, `${bytes} > ${JD_SNAPSHOT_MAX_BYTES}`);
  assert.ok(bytes > JD_SNAPSHOT_MAX_BYTES - 4096, "cap is used, not wildly undershot");
  assert.equal(JD_SNAPSHOT_MAX_BYTES, 200 * 1024);
  assertSafe(result.html, "capped");
  assert.ok(result.html.startsWith("<p>000 xxxx"));
  assert.match(result.html, /truncated/i);
  assert.deepEqual(lines, []);
  // small input is untouched
  const small = await captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: fakeFetch(() => json({ content: enc("<p>tiny</p>") })).fetchFn });
  assert.equal(small?.html, "<p>tiny</p>");
});

test("capture: never fetches for a role without a link even when a vendor is guessable from company.ats", async () => {
  const { fetchFn, calls } = fakeFetch(() => html("<p>x</p>"));
  const r = await captureErrors(() => captureJobDescription({ role: { id: "r", link: null, source: "scanner" }, company: { ats: "greenhouse", endpoint: "greenhouse:stripe" } }, { fetch: fetchFn }));
  assert.equal(r.result, null);
  assert.equal(calls.length, 0);
});

// ------------------------------------------------------- F1: CPU / size bounds --
// Audit 2026-08-23: unbounded open-tag stack made closeTo() quadratic (1 MB of
// <ul> = 91 s) and the page path sanitized the whole response before the cap.

test("F1: 100k <ul> (400 KB) sanitizes in < 1 s, grammar clean, idempotent (depth is bounded)", () => {
  const input = "<ul>".repeat(100_000);
  const t0 = performance.now();
  const out = sanitizeJobHtml(input);
  const ms = performance.now() - t0;
  console.log(`F1 timing: 100k <ul> sanitized in ${ms.toFixed(1)} ms`);
  assert.ok(ms < 1000, `took ${ms} ms`);
  assertSafe(out, "100k ul");
  assert.equal(sanitizeJobHtml(out), out);
  assert.ok(out.length < 2000, "bounded depth → bounded output");
});

test("F1: raw input is truncated to JD_RAW_MAX (1 MiB) before sanitizing", () => {
  assert.equal(JD_RAW_MAX, 1 << 20);
  const out = sanitizeJobHtml("x".repeat(JD_RAW_MAX) + "<p>tail</p>");
  assert.equal(out.length, JD_RAW_MAX + "<p></p>".length); // the run keeps its implicit <p>
  assert.ok(!out.includes("tail"));
  // exactly at the limit nothing is lost
  assert.equal(sanitizeJobHtml("y".repeat(JD_RAW_MAX - 8) + "<p>t</p>").endsWith("<p>t</p>"), true);
});

test("F1: capBytes converges in ≤ 3 passes and never exceeds 200 KB, even with the cut inside deep nesting", () => {
  // 210 KB of nested <ul><li>: depth bound keeps the output tiny → no cap needed
  const nested = capBytesStats("<ul><li>".repeat(26_000) + "x");
  assert.ok(nested.passes <= 3);
  assert.ok(new TextEncoder().encode(nested.html).length <= JD_SNAPSHOT_MAX_BYTES);
  assertSafe(nested.html, "nested");
  // a flat 300 KB page whose cut point lands inside 64 open <ul><li> pairs
  const flat = sanitizeJobHtml("<p>" + "x".repeat(204_000) + "</p>" + "<ul><li>".repeat(64) + "y".repeat(100_000));
  const capped = capBytesStats(flat);
  const bytes = new TextEncoder().encode(capped.html).length;
  assert.ok(capped.passes <= 3, `passes ${capped.passes}`);
  assert.ok(bytes <= JD_SNAPSHOT_MAX_BYTES && bytes > JD_SNAPSHOT_MAX_BYTES - 4096, `bytes ${bytes}`);
  assertSafe(capped.html, "flat capped");
  assert.match(capped.html, /truncated/);
});

test("F1: page fetch larger than JD_RAW_MAX is bounded end-to-end (capture stays fast, output ≤ 200 KB)", async () => {
  const body = "<ul>x".repeat(240_000); // 1.2 MB of pathological nesting, text at every level
  const { fetchFn } = fakeFetch(() => html(body));
  const t0 = performance.now();
  const r = await captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: fetchFn });
  const ms = performance.now() - t0;
  assert.ok(r, "captures");
  assert.ok(ms < 2000, `took ${ms} ms`);
  assert.ok(new TextEncoder().encode(r.html).length <= JD_SNAPSHOT_MAX_BYTES);
  assertSafe(r.html, "big page");
});

// ------------------------------------------------------------ F2: storability --
// Audit 2026-08-23: NUL and lone surrogates survived to the output; Postgres
// rejects NUL in text and invalid UTF-8, so the slice-5/7 write would throw
// AFTER the capture "succeeded".
const UNSTORABLE = /\0|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

test("F2: NUL and lone surrogates in text become U+FFFD; a valid astral pair passes through", () => {
  assert.equal(sanitizeJobHtml("<p>a\0b</p>"), "<p>a\uFFFDb</p>");
  assert.equal(sanitizeJobHtml("<p>x\ud800y\udc00z</p>"), "<p>x\uFFFDy\uFFFDz</p>");
  assert.equal(sanitizeJobHtml("<p>\ud83d\ude00 😀</p>"), "<p>😀 😀</p>");
  assert.doesNotMatch(sanitizeJobHtml("<p>\0\ud800\udfff</p><ul><li>\0</li></ul>"), UNSTORABLE);
});

test("F2: decodeEntitiesOnce maps &#0; and surrogate code points to U+FFFD, keeps astral", () => {
  assert.equal(decodeEntitiesOnce("&#xD800;&#0;&#x1F600;&#xDFFF;&#55296;"), "\uFFFD\uFFFD😀\uFFFD\uFFFD");
  assert.doesNotMatch(sanitizeJobHtml(decodeEntitiesOnce("&lt;p&gt;&#xD800;&#0;&lt;/p&gt;")), UNSTORABLE);
});

test("F2: Greenhouse content carrying a lone surrogate + NUL captures with no unstorable code unit", async () => {
  const { fetchFn } = fakeFetch(() => json({ content: "&lt;p&gt;a\ud800b\u0000c&lt;/p&gt;&#xDC00;" }));
  const r = await captureJobDescription({ role: GH_ROLE, company: noCo }, { fetch: fetchFn });
  assert.ok(r);
  assert.doesNotMatch(r.html, UNSTORABLE);
  assert.equal(r.html, "<p>a\uFFFDb\uFFFDc</p><p>\uFFFD</p>");
  assertSafe(r.html, "F2 greenhouse");
});

test("F2: page fetch with NUL bytes captures with no unstorable code unit", async () => {
  const { fetchFn } = fakeFetch(() => html("<h1>T\0itle</h1><p>\udbff</p>"));
  const r = await captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: fetchFn });
  assert.ok(r);
  assert.doesNotMatch(r.html, UNSTORABLE);
  assert.equal(r.html, "<h1>T\uFFFDitle</h1><p>\uFFFD</p>");
});

// -------------------------------------------- D25: real postings, real shape --
// Fixtures captured live 2026-08-24 through the SAME fetch path the code uses
// (atsDescriptionUrl(...).url for the four vendors, a plain GET for the two
// career pages). They are the proof that a snapshot reads like the employer's
// page instead of one run-on paragraph.

const noCoName = { ats: null, endpoint: null, name: null };
const linkOf = (l: string) => ({ link: l, source: null });

// A heading inside a paragraph is exactly the screenshot bug ("A World-Changing
// Company  Palantir builds\u2026" as one block).
const assertBlocks = (out: string, label: string, min = 3) => {
  assertSafe(out, label);
  const blocks = (out.match(/<(p|li|h[1-4])>/g) ?? []).length;
  assert.ok(blocks >= min, `${label}: only ${blocks} block tags`);
  assert.doesNotMatch(out, /<p>(?:(?!<\/p>)[\s\S])*<h[1-4]>/, `${label}: a heading is trapped inside a <p>`);
  assert.doesNotMatch(out, /<p><\/p>/, `${label}: empty paragraph`);
  assert.equal(sanitizeJobHtml(out), out, `${label}: not idempotent`);
  return blocks;
};

const REAL_ATS: Array<[string, string, string]> = [
  ["real-greenhouse-content.json", "https://job-boards.greenhouse.io/sezzle/jobs/7906408003", "Sezzle"],
  ["real-lever-posting.json", "https://jobs.lever.co/tri/186808f9-464c-4f22-9d7d-4372ef272ff0", "Toyota Research Institute"],
  ["real-lever-palantir.json", "https://jobs.lever.co/palantir/774cf5c9-bf6a-4d77-bf60-d50ef1beb1a0", "Palantir"],
  ["real-ashby-board.json", "https://jobs.ashbyhq.com/windborne-systems/a0adb58d-37e7-4e37-abf5-c77d63d4dd8f", "WindBorne"],
  [
    "real-workday-detail.json",
    "https://micron.wd1.myworkdayjobs.com/en-US/External/job/Boise-ID---Main-Site/Intern---Process-Development-Engineer--3D-DRAM-Photo_JR107312",
    "Micron",
  ],
  ["real-oracle-ce.json", "https://egug.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/26011784", "American Express"],
];

test("D25 fixtures: every real ATS posting renders as blocks (>= 3), balanced, idempotent", async () => {
  for (const [fx, link, marker] of REAL_ATS) {
    const plan = atsDescriptionUrl(noCoName, linkOf(link), []);
    assert.ok(plan, fx);
    const raw = plan.pick(await readJson(fx));
    assert.ok(raw, `${fx}: pick found nothing`);
    const out = sanitizeJobHtml(raw);
    const blocks = assertBlocks(out, fx);
    assert.ok(out.includes(marker), `${fx}: expected ${marker} in the snapshot`);
    console.log(`D25 ${fx}: ${blocks} block tags, ${out.length} chars`);
  }
});

test("D25 fixtures: every real career PAGE renders as blocks (>= 3), balanced, idempotent", async () => {
  for (const fx of ["real-page-smartrecruiters.html", "real-page-amazon.html"]) {
    const out = sanitizeJobHtml(await readFx(fx));
    const blocks = assertBlocks(out, fx);
    console.log(`D25 ${fx}: ${blocks} block tags, ${out.length} chars`);
  }
});

// ------------------------------------------------------- ld+json: real pages --
// Fixtures fetched live 2026-08-24 from career pages with no vendor API
// (apply.deloitte.com, jobs.jobvite.com — neither is greenhouse/lever/ashby/
// workday/oracle) that each embed a schema.org JobPosting as ld+json. Proof
// that captureJobDescription/captureJobPosting use the posting's own HTML
// instead of the whole page (nav/cookie/footer chrome excluded).

test("ld+json real pages: extractJobPostingLdJson finds the posting and its content survives sanitizing, chrome does not", async () => {
  const deloitte = extractJobPostingLdJson(await readFx("real-page-deloitte.html"));
  assert.ok(deloitte);
  const dOut = sanitizeJobHtml(deloitte.description);
  assertBlocks(dOut, "real-page-deloitte", 5);
  assert.ok(dOut.includes("Summer Scholar"), "deloitte: posting text survives");
  assert.doesNotMatch(dOut, /Cookies|Main site navigation/, "deloitte: nav/footer chrome excluded");

  const jobvite = extractJobPostingLdJson(await readFx("real-page-jobvite.html"));
  assert.ok(jobvite);
  const jOut = sanitizeJobHtml(jobvite.description);
  assertBlocks(jOut, "real-page-jobvite", 3);
  assert.ok(jOut.includes("Altamira Technologies has a long and successful history"), "jobvite: posting text survives");
  assert.doesNotMatch(jOut, /Powered by Jobvite/, "jobvite: footer chrome excluded");
  assert.equal(jobvite.location, "Fairborn, OH");
});

test("ld+json real pages: captureJobDescription's page-fetch path uses the ld+json description, not the whole page", async () => {
  for (const [fx, marker, chrome] of [
    ["real-page-deloitte.html", "Summer Scholar", "Cookies"],
    ["real-page-jobvite.html", "Altamira Technologies", "Powered by Jobvite"],
  ] as const) {
    const page = await readFx(fx);
    const { fetchFn } = fakeFetch(() => html(page));
    const r = await captureJobDescription({ role: PAGE_ROLE, company: noCo }, { fetch: fetchFn, now: NOW });
    assert.ok(r, fx);
    assert.equal(r.via, "page", fx);
    assert.ok(r.html.includes(marker), `${fx}: expected ${JSON.stringify(marker)}`);
    assert.doesNotMatch(r.html, new RegExp(chrome), `${fx}: chrome leaked`);
    assertSafe(r.html, fx);
  }
});

test("ld+json real pages: captureJobPosting (no ATS route) returns html + location from the Jobvite ld+json", async () => {
  const page = await readFx("real-page-jobvite.html");
  const { fetchFn } = fakeFetch(() => html(page));
  const r = await captureJobPosting(PAGE_ROLE, noCo, { fetch: fetchFn });
  assert.equal(r.error, null);
  assert.equal(r.location, "Fairborn, OH");
  assert.ok(r.html?.includes("Altamira Technologies"));
  assertSafe(r.html!, "captureJobPosting jobvite");
});

test("D25 fixtures: the Palantir posting no longer runs its heading into the body (the v5 screenshot)", async () => {
  const plan = atsDescriptionUrl(noCoName, linkOf("https://jobs.lever.co/palantir/774cf5c9-bf6a-4d77-bf60-d50ef1beb1a0"), [])!;
  const out = sanitizeJobHtml(plan.pick(await readJson("real-lever-palantir.json"))!);
  // Lever's description is one <div> whose body text sits BETWEEN block children
  // \u2014 the old sanitizer emitted that text bare, so it glued onto the heading.
  assert.match(out, /<h3><strong>A World-Changing Company\s*<\/strong><\/h3><p>Palantir builds/);
  assert.ok((out.match(/<p>/g) ?? []).length >= 2, "the div-only body is paragraphed");
  // A9 compose: `additional` is present (here the French version of the posting),
  // so the snapshot is the whole posting, not just Lever's intro field.
  assert.ok(out.includes("Une entreprise qui transforme le monde"), "additional carried through");
  assertBlocks(out, "palantir", 10);
});

test("D25 fixtures: a div-only document yields >= 2 paragraphs and keeps every word", () => {
  const divOnly = "<div><div>First block of the posting.</div><div><span>Second</span> block.</div><div>Third block.</div></div>";
  const out = sanitizeJobHtml(divOnly);
  assert.equal(out, "<p>First block of the posting.</p><p>Second block.</p><p>Third block.</p>");
  assert.ok((out.match(/<p>/g) ?? []).length >= 2);
  assertBlocks(out, "div-only");
});
