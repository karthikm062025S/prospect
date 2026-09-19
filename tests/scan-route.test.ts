import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterTier } from "../lib/scan-tier.ts";
import { buildIssueBody, buildIssueTitle, issueDay, issueMention, postDailyIssue, type NotifyRole } from "../lib/scan-notify.ts";

// /api/scan's pure halves (MISSION A4): the tier split over the REAL data files
// and the per-day GitHub issue the fast lane @mentions on. The issue title +
// body must be byte-identical to .github/workflows/scan.yml's notify step so a
// fast-lane run and an Actions run land on the SAME open issue for the day
// (comment, not a second issue).

const here = new URL(".", import.meta.url);
const endpoints = JSON.parse(readFileSync(new URL("../scripts/endpoints.json", here), "utf8"));
const targets = JSON.parse(readFileSync(new URL("../scripts/targets.json", here), "utf8"));

test("hot tier over the real endpoints.json / targets.json is the spike-5 measured 232 of 999", () => {
  assert.equal(endpoints.length, 999);
  assert.equal(filterTier(endpoints, targets, "hot").length, 232);
  assert.equal(filterTier(endpoints, targets, "full").length, 999);
});

// ---- title + body: scan.yml lines 71-76, replicated ----

test("issueDay is the America/New_York calendar day, like scan.yml's `TZ=America/New_York date +%F`", () => {
  assert.equal(issueDay(new Date("2026-08-24T15:00:00Z")), "2026-08-24");
  // 03:00Z is still the previous evening in New York (EDT = UTC-4)
  assert.equal(issueDay(new Date("2026-08-24T03:00:00Z")), "2026-08-23");
  assert.equal(issueDay(new Date("2026-08-24T04:00:00Z")), "2026-08-24");
});

// G1 L3: the repo is a parameter now (env `SCOUT_ISSUE_REPO`, read in
// app/api/scan/route.ts), not a module const in lib/scan-notify.ts.
const REPO = "karthikm062025S/intern-hq";

test("the @mention is derived from the repo owner", () => {
  assert.equal(issueMention(REPO), "@karthikm062025S");
  assert.equal(issueMention("acme/scout"), "@acme");
});

test("buildIssueTitle matches scan.yml exactly", () => {
  assert.equal(buildIssueTitle("2026-08-24"), "Scout: new drops — 2026-08-24");
});

test("buildIssueBody matches scan.yml's node one-liner byte for byte", () => {
  const inserted: NotifyRole[] = [
    { company: "Stripe", title: "Software Engineer Intern", role_type: "swe", posted_at: "2026-08-24", link: "https://stripe.com/jobs/1" },
    { company: "Palantir", title: "ML Intern", role_type: "ai_ml", posted_at: null, link: null },
  ];
  assert.equal(
    buildIssueBody(inserted, REPO),
    "@karthikm062025S — 2 fresh role(s) found:\n\n" +
      "- **Stripe** — Software Engineer Intern [swe] 2026-08-24 — https://stripe.com/jobs/1\n" +
      "- **Palantir** — ML Intern [ai_ml] \n\n" +
      "→ https://scoutfeed.vercel.app",
  );
});

test("buildIssueBody with one role says 1 fresh role(s)", () => {
  const body = buildIssueBody([{ company: "A", title: "B Intern", role_type: "data", posted_at: "2026-01-01", link: "https://a/b" }], REPO);
  assert.match(body, /^@karthikm062025S — 1 fresh role\(s\) found:\n\n- \*\*A\*\* — B Intern \[data\] 2026-01-01 — https:\/\/a\/b\n\n→ /);
});

// ---- postDailyIssue: list open issues, comment on today's or create it ----

type Call = { url: string; init: RequestInit | undefined };
function ghFake(openIssues: Array<{ number: number; title: string; pull_request?: object }>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if ((init?.method ?? "GET") === "GET") return Response.json(openIssues);
    if (url.endsWith("/comments")) return Response.json({ id: 1 }, { status: 201 });
    return Response.json({ number: 99 }, { status: 201 });
  };
  return { fetch, calls };
}
const role: NotifyRole = { company: "Stripe", title: "SWE Intern", role_type: "swe", posted_at: "2026-08-24", link: "https://x/1" };
const now = new Date("2026-08-24T15:00:00Z");

test("comments on the open issue whose title is today's (first match wins; PRs ignored)", async () => {
  const gh = ghFake([
    { number: 5, title: "Scout: new drops — 2026-08-24", pull_request: {} }, // a PR with the same title is not an issue
    { number: 41, title: "Scout: new drops — 2026-08-24" },
    { number: 40, title: "Scout: new drops — 2026-08-24" },
    { number: 39, title: "Scout: new drops — 2026-08-23" },
  ]);
  const out = await postDailyIssue({ fetch: gh.fetch, token: "tok", repo: REPO, inserted: [role], now });
  assert.deepEqual(out, { action: "commented", number: 41 });
  assert.equal(gh.calls.length, 2);
  assert.equal(gh.calls[0].url, "https://api.github.com/repos/karthikm062025S/intern-hq/issues?state=open&per_page=100");
  assert.equal(gh.calls[1].url, "https://api.github.com/repos/karthikm062025S/intern-hq/issues/41/comments");
  assert.equal(gh.calls[1].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(gh.calls[1].init?.body)), { body: buildIssueBody([role], REPO) });
  for (const c of gh.calls) {
    const h = new Headers(c.init?.headers);
    assert.equal(h.get("authorization"), "Bearer tok");
    assert.equal(h.get("accept"), "application/vnd.github+json");
    assert.ok(h.get("user-agent"));
  }
});

test("creates the issue when no open issue carries today's title", async () => {
  const gh = ghFake([{ number: 39, title: "Scout: new drops — 2026-08-23" }]);
  const out = await postDailyIssue({ fetch: gh.fetch, token: "tok", repo: REPO, inserted: [role], now });
  assert.deepEqual(out, { action: "created", number: 99 });
  assert.equal(gh.calls[1].url, "https://api.github.com/repos/karthikm062025S/intern-hq/issues");
  assert.equal(gh.calls[1].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(gh.calls[1].init?.body)), {
    title: "Scout: new drops — 2026-08-24",
    body: buildIssueBody([role], REPO),
  });
});

test("a failing GitHub call throws with the status (the route logs it and never fails the scan)", async () => {
  const fetch = async () => new Response("bad credentials", { status: 401 });
  await assert.rejects(postDailyIssue({ fetch, token: "tok", repo: REPO, inserted: [role], now }), /GitHub .* 401/);
});

test("nothing inserted → no GitHub call at all", async () => {
  const gh = ghFake([]);
  const out = await postDailyIssue({ fetch: gh.fetch, token: "tok", repo: REPO, inserted: [], now });
  assert.deepEqual(out, { action: "skipped", number: null });
  assert.equal(gh.calls.length, 0);
});
