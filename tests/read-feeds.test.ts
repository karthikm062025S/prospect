import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadContext } from "../scripts/read-alerts.mjs";
import { parseFeed, ingestFeeds, parseAgeDays, withinFeedWindow, roleKey } from "../scripts/read-feeds.mjs";

// Fixtures model the two REAL list formats (fetched 2026-07-13): SimplifyJobs
// renders an HTML <table> with a relative Age ("1d","1mo"); vanshb03 renders a
// pipe-markdown table with an absolute Date Posted ("Jul 12"). The tests run the
// SAME path main() runs: parseFeed -> ingestFeeds over the real targets.json +
// endpoints.json context.
const here = dirname(fileURLToPath(import.meta.url));
const readFx = (name: string) => readFile(join(here, "fixtures", "feeds", name), "utf8");

let ctxCache: Awaited<ReturnType<typeof loadContext>> | undefined;
const getCtx = async () => (ctxCache ??= await loadContext());

async function ingestFixture(file: string, listName: string, sinceDays: number) {
  const md = await readFx(file);
  const cands = parseFeed(md, listName);
  const ctx = await getCtx();
  const res = ingestFeeds(
    cands.map((cand: unknown) => ({ cand, listName })),
    ctx,
    sinceDays,
  );
  return { cands, ...res };
}

type Role = { company: string; [k: string]: unknown };
const byCompany = (roles: Role[]) => Object.fromEntries(roles.map((r) => [r.company, r]));

test("SimplifyJobs HTML table: targets survive (feed-target); geo, wrong-term dropped; scanner-covered skipped; stale windowed out", async () => {
  // Relative-age fixture → sinceDays=2 is stable regardless of run date.
  const { cands, roles, skippedScanner, dropped, stale } = await ingestFixture("simplify.md", "simplify", 2);
  assert.equal(cands.length, 7, "7 open rows parse (the 🔒 closed Palantir row is skipped)");

  assert.deepEqual(roles.map((r) => r.company).sort(), ["Citadel", "Foobar Labs", "Google"]);
  const by = byCompany(roles);
  assert.equal(by["Google"].source, "feed-target:simplify"); // giant → mandatory tailoring
  assert.equal(by["Google"].role_type, "SWE");
  assert.equal(by["Google"].posted_at, null); // dedup on (company,title) across hourly runs
  assert.equal(
    by["Google"].link,
    "https://boards.greenhouse.io/embed/job_app?for=google&token=1001&utm_source=Simplify&ref=Simplify",
  ); // real ATS apply link, NOT the simplify.jobs tracker
  assert.equal(by["Citadel"].source, "feed-target:simplify");
  assert.equal(by["Citadel"].role_type, "AI");
  assert.equal(by["Foobar Labs"].source, "feed:simplify"); // not a target → no mandatory-tailoring tag

  assert.equal(skippedScanner, 1, "Stripe is scanner-covered → skipped, not duplicated");
  assert.equal(dropped, 2, "Revolut (London geo) + Netflix (Fall 2026 term)");
  assert.equal(stale, 1, "Google ML @ 1mo is outside the 2-day window");
});

test("vanshb03 pipe-markdown: ↳ carries company forward; target tagged; scanner-covered skipped; closed row skipped", async () => {
  // Absolute-date fixture → use a wide window so the assertions don't rot as real
  // time passes (the recency window itself is covered by the SimplifyJobs + unit tests).
  const { cands, roles, skippedScanner } = await ingestFixture("vanshb03.md", "vanshb03", 3650);
  assert.equal(cands.length, 3, "3 open rows (the 🔒 closed Globex row yields no candidate)");

  assert.equal(roles.length, 2);
  assert.deepEqual(roles.map((r) => r.company), ["Two Sigma", "Two Sigma"]); // ↳ carried forward
  assert.deepEqual(roles.map((r) => r.role_type).sort(), ["Data", "SWE"]);
  for (const r of roles) assert.equal(r.source, "feed-target:vanshb03");
  assert.equal(roles[1].link, "https://careers.twosigma.com/careers/Apply/5002"); // ↳ row keeps its own link
  assert.equal(skippedScanner, 1, "Jane Street is scanner-covered → skipped");
});

test("recency window: relative + absolute ages parse; unparseable keeps", () => {
  assert.equal(parseAgeDays("3d"), 3);
  assert.equal(parseAgeDays("1mo"), 30);
  assert.equal(parseAgeDays("2w"), 14);
  assert.ok((parseAgeDays("6h") ?? 99) < 1); // hours → sub-day
  assert.equal(parseAgeDays(""), null);
  assert.equal(parseAgeDays("who knows"), null);

  assert.equal(withinFeedWindow("1d", 2), true);
  assert.equal(withinFeedWindow("2d", 2), true);
  assert.equal(withinFeedWindow("1mo", 2), false);
  assert.equal(withinFeedWindow("", 2), true); // unparseable → keep (mirror scan.withinWindow)

  // Absolute month-day path, computed against "now" so it's stable across dates.
  const now = new Date();
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getUTCMonth()];
  assert.equal(withinFeedWindow(`${mon} ${now.getUTCDate()}`, 2), true); // today → fresh
});

test("feed roles never emit demoting fields (mirror scanner/alerts no-demote payload)", async () => {
  const { roles } = await ingestFixture("simplify.md", "simplify", 2);
  assert.ok(roles.length > 0);
  for (const r of roles) {
    for (const forbidden of ["lifecycle", "eligible", "eligibility_note", "fit_note", "priority", "notes"]) {
      assert.ok(!(forbidden in r), `feed role must not emit "${forbidden}"`);
    }
    assert.equal(r.posted_at, null);
  }
});

test("title normalization: parseFeed collapses internal whitespace, decodes entities, preserves case (same posting → same title every run)", () => {
  // Messy title: doubled internal spaces + a `&amp;` entity + surrounding pad. The
  // webhook dedups on an exact eq(title), so this MUST normalize identically each run.
  const md = [
    "| Company | Role | Location | Application/Link | Date Posted |",
    "| --- | --- | --- | --- | --- |",
    '| **[Google](https://simplify.jobs/c/Google)** | Software   Engineer &amp; ML  Intern | New York, NY | <a href="https://boards.greenhouse.io/embed/job_app?for=google">Apply</a> | 1d |',
  ].join("\n");
  const cands = parseFeed(md, "vanshb03") as Array<{ title: string }>;
  assert.equal(cands.length, 1);
  assert.equal(cands[0].title, "Software Engineer & ML Intern"); // collapsed, decoded, trimmed, case kept
});

test("speedyapply: its real 6-column (Salary) layout is incompatible with the 5-column parser → 0 roles extracted (source disabled)", async () => {
  const md = await readFx("speedyapply.md");
  const cands = parseFeed(md, "speedyapply");
  // The apply <a href> sits in the Posting column (index 4); the 5-column parser reads
  // index 3 (Salary, e.g. "$62/hr") as the apply cell, finds no href, and drops every
  // row. This proves WHY speedyapply is commented out of FEEDS in read-feeds.mjs. If
  // parsePipeFeed is later taught the salary/variable-column layout, this test will
  // start extracting rows and fail — re-enable the source and assert correct extraction.
  assert.equal(cands.length, 0);
});

test("idempotency: a shared seen-set makes a second pass over the same fixture yield ZERO new roles to notify/POST", async () => {
  const md = await readFx("simplify.md");
  const cands = parseFeed(md, "simplify");
  const ctx = await getCtx();
  const pairs = cands.map((cand: unknown) => ({ cand, listName: "simplify" }));
  const seen = new Set<string>();

  const first = ingestFeeds(pairs, ctx, 2, seen);
  assert.ok(first.roles.length > 0, "first pass surfaces the fresh roles");
  for (const role of first.roles) seen.add(roleKey(role)); // record what a real run would POST

  const second = ingestFeeds(pairs, ctx, 2, seen);
  assert.equal(second.roles.length, 0, "second pass: every key already seen → nothing re-notified/re-POSTed");
  assert.equal(second.alreadySeen, first.roles.length, "all first-pass roles counted as already-seen");
});
