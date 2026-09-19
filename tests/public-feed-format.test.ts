import { test } from "node:test";
import assert from "node:assert/strict";
import { capPerCompany, groupDrops, relativeAdded } from "../lib/public-feed-format.ts";

const NOW = Date.parse("2026-09-02T18:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("anything under an hour reads as just now", () => {
  assert.equal(relativeAdded(ago(0), NOW), "just now");
  assert.equal(relativeAdded(ago(59 * MIN), NOW), "just now");
});

test("the first day counts in whole hours", () => {
  assert.equal(relativeAdded(ago(HOUR), NOW), "1h ago");
  assert.equal(relativeAdded(ago(2 * HOUR + 40 * MIN), NOW), "2h ago");
  assert.equal(relativeAdded(ago(23 * HOUR), NOW), "23h ago");
});

test("past a day it counts days, then weeks", () => {
  assert.equal(relativeAdded(ago(DAY), NOW), "1d ago");
  assert.equal(relativeAdded(ago(6 * DAY), NOW), "6d ago");
  assert.equal(relativeAdded(ago(7 * DAY), NOW), "1w ago");
  assert.equal(relativeAdded(ago(21 * DAY), NOW), "3w ago");
});

test("a future timestamp or an unparseable one never renders a negative count", () => {
  assert.equal(relativeAdded(new Date(NOW + 5 * HOUR).toISOString(), NOW), "just now");
  assert.equal(relativeAdded("not a date", NOW), "just now");
});

// --- v7/feed lane, 2026-09-03. Source-level lock (lib/public-feed.ts and
// lib/public-stats.ts import next/cache, which `node --experimental-strip-types`
// cannot resolve, so their queries can only be asserted as text — the same
// technique tests/no-service-in-app.test.ts and tests/proxy-matcher.test.ts use).
//
// `roles.hidden_at` is the OWNER's legacy per-user hide, superseded by
// `user_roles` (MISSION v7 D3/D4: "one user must not starve the shared feed").
// Both public reads filtered on it, so every role Karthik had ever hidden was
// invisible to every anonymous visitor and missing from the open-roles tile.
import { readFileSync } from "node:fs";

const PUBLIC_READS = ["lib/public-feed.ts", "lib/public-stats.ts"];

for (const file of PUBLIC_READS) {
  test(`${file} does not scope the PUBLIC read by the owner's roles.hidden_at`, () => {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    assert.equal(
      /hidden_at/.test(code),
      false,
      `${file} still filters the public feed on roles.hidden_at`,
    );
  });

  test(`${file} still scopes the public read to open roles`, () => {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(src, /\.eq\("lifecycle", "open"\)/);
  });
}

// --- v8 D12: company drops -------------------------------------------------

const drop = (company: string, title: string, msAgo: number) => ({
  company,
  title,
  createdAt: ago(msAgo),
});

/** n roles for one company, newest first at `startAgo`, one hour apart. */
const batch = (company: string, n: number, startAgo: number) =>
  Array.from({ length: n }, (_, i) => drop(company, `${company} role ${i}`, startAgo + i * HOUR));

test("a company needs three roles in the window to count as a drop", () => {
  const groups = groupDrops([...batch("Amazon", 3, HOUR), ...batch("Stripe", 2, HOUR)], NOW);
  assert.deepEqual(
    groups.map((g) => g.company),
    ["Amazon"],
  );
  assert.equal(groups[0].count, 3);
});

test("roles older than seven days are outside the window", () => {
  const groups = groupDrops(
    [...batch("Amazon", 2, HOUR), drop("Amazon", "Old one", 8 * DAY)],
    NOW,
  );
  assert.deepEqual(groups, []);
});

test("groups order by count, then by the newest role", () => {
  const groups = groupDrops(
    [
      ...batch("Stripe", 4, 5 * HOUR),
      ...batch("Amazon", 4, HOUR),
      ...batch("Figma", 9, 2 * DAY),
    ],
    NOW,
  );
  assert.deepEqual(
    groups.map((g) => g.company),
    ["Figma", "Amazon", "Stripe"],
  );
});

test("a group carries the newest timestamp, its relative form and up to two sample titles", () => {
  const groups = groupDrops(batch("Amazon", 5, 2 * HOUR), NOW);
  assert.equal(groups[0].newestAt, new Date(NOW - 2 * HOUR).toISOString());
  assert.equal(groups[0].added, "2h ago");
  assert.deepEqual(groups[0].sample, ["Amazon role 0", "Amazon role 1"]);
});

test("at most six companies reach the strip", () => {
  const rows = ["A", "B", "C", "D", "E", "F", "G", "H"].flatMap((c, i) =>
    batch(c, 3 + i, HOUR),
  );
  assert.equal(groupDrops(rows, NOW).length, 6);
});

test("an unparseable timestamp is not counted", () => {
  const rows = [...batch("Amazon", 2, HOUR), { company: "Amazon", title: "x", createdAt: "nope" }];
  assert.deepEqual(groupDrops(rows, NOW), []);
});

const row = (id: string, company: string) => ({ id, company });

test("capPerCompany keeps the first three rows of a company, in order", () => {
  const rows = [
    row("1", "Amazon"),
    row("2", "Amazon"),
    row("3", "Stripe"),
    row("4", "Amazon"),
    row("5", "Amazon"),
    row("6", "Amazon"),
  ];
  const capped = capPerCompany(rows, 3);
  assert.deepEqual(
    capped.rows.map((r) => r.id),
    ["1", "2", "3", "4"],
  );
  assert.equal(capped.collapsed.get("Amazon"), 2);
  assert.equal(capped.collapsed.has("Stripe"), false);
});

test("capPerCompany leaves a list under the cap untouched", () => {
  const rows = [row("1", "Amazon"), row("2", "Stripe")];
  const capped = capPerCompany(rows);
  assert.deepEqual(capped.rows, rows);
  assert.equal(capped.collapsed.size, 0);
});
