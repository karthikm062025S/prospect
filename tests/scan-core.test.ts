import { test } from "node:test";
import assert from "node:assert/strict";
import { scanEndpoints } from "../scripts/scan-core.mjs";

// scanEndpoints is the fetch + filter body of scripts/scan.mjs moved verbatim
// (RB-082 v2, slice 6c) so the CLI and app/api/scan/route.ts run the SAME code.
// This locks its contract through an injected fetch: the returned `roles` are
// the exact minimal webhook payloads the CLI POSTs (title gate, recency window,
// US filter, per-run dedup, multi-location collapse, endpoint order), plus the
// okCount / failed / rawCounts the CLI's health floor + canary need.

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const boards: Record<string, unknown> = {
  "https://boards-api.greenhouse.io/v1/boards/acme/jobs": {
    jobs: [
      { id: 1, title: "Software Engineer Intern", location: { name: "New York, NY" }, first_published: daysAgo(1), absolute_url: "https://acme/1" },
      { id: 2, title: "Software Engineer Intern", location: { name: "Seattle, WA" }, first_published: daysAgo(1), absolute_url: "https://acme/2" }, // multi-location → collapsed
      { id: 3, title: "Marketing Intern", location: { name: "New York, NY" }, first_published: daysAgo(1), absolute_url: "https://acme/3" }, // title gate
      { id: 4, title: "Data Scientist Intern", location: { name: "Austin, TX" }, first_published: daysAgo(30), absolute_url: "https://acme/4" }, // outside window
      { id: 5, title: "Machine Learning Intern", location: { name: "London, UK" }, first_published: daysAgo(1), absolute_url: "https://acme/5" }, // non-US
    ],
  },
  "https://api.lever.co/v0/postings/beta?mode=json": [
    { id: "L1", text: "Quantitative Trader Intern", categories: { location: "Chicago, IL" }, createdAt: Date.now() - 86400000, hostedUrl: "https://beta/L1" },
  ],
};

const fakeFetch = (async (url: string) => {
  const data = boards[url];
  if (!data) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  return { ok: true, status: 200, json: async () => data, text: async () => "" };
}) as unknown as typeof fetch;

const endpoints = [
  { company: "Acme", ats: "greenhouse", token: "acme" },
  { company: "Ghost", ats: "greenhouse", token: "ghost" }, // 404 → failed
  { company: "Beta", ats: "lever", token: "beta" },
  { company: "Weird", ats: "nope", token: "x" }, // unknown ats → failed, not fetched
];

test("scanEndpoints returns the minimal webhook payloads in endpoint order", async () => {
  const { roles, okCount, failed, rawCounts } = await scanEndpoints(endpoints, { sinceDays: 3, concurrency: 1, fetch: fakeFetch });
  assert.deepEqual(roles, [
    { company: "Acme", title: "Software Engineer Intern", role_type: "SWE", posted_at: daysAgo(1).slice(0, 10), link: "https://acme/1", source: "scanner", location: "New York, NY" },
    { company: "Beta", title: "Quantitative Trader Intern", role_type: "Quant", posted_at: daysAgo(1).slice(0, 10), link: "https://beta/L1", source: "scanner", location: "Chicago, IL" },
  ]);
  assert.equal(okCount, 2);
  assert.deepEqual(failed, ["Ghost (greenhouse: HTTP 404)", "Weird (unknown ats nope)"]);
  assert.deepEqual(rawCounts, { "greenhouse:acme": 5, "lever:beta": 1 });
});

test("scanEndpoints gives the same role set under concurrency", async () => {
  const a = await scanEndpoints(endpoints, { sinceDays: 3, concurrency: 1, fetch: fakeFetch });
  const b = await scanEndpoints(endpoints, { sinceDays: 3, concurrency: 8, fetch: fakeFetch });
  assert.deepEqual(new Set(b.roles.map((r) => r.link)), new Set(a.roles.map((r) => r.link)));
  assert.equal(b.okCount, a.okCount);
});

test("sinceDays is honored per call, not read from process.argv", async () => {
  const { roles } = await scanEndpoints(endpoints, { sinceDays: 60, concurrency: 1, fetch: fakeFetch });
  assert.ok(roles.some((r) => r.title === "Data Scientist Intern"));
});
