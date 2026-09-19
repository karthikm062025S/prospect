import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTier, normName } from "../lib/scan-tier.ts";

// The fast lane's tier split (RB-082 v2, slice 6c). `hot` = endpoints whose
// company resolves (via the same normName rules read-alerts.mjs uses) to a
// target in scripts/targets.json: a `companies` key, the parenthetical content
// of one ("SIG" for "Susquehanna (SIG)"), or an `aliases` key. `full` = every
// endpoint, untouched. Pure — no I/O — so the route and this test share it.
const targets = {
  companies: {
    Google: "Big Tech",
    "Susquehanna (SIG)": "Fintech / Banks / Quant",
    "D. E. Shaw": "Fintech / Banks / Quant",
    "UnitedHealth Group (Optum)": "Consumer / Media / Health",
  },
  aliases: { Alphabet: "Google", JPMorgan: "JPMorgan Chase" },
};

const endpoints = [
  { company: "Stripe", ats: "greenhouse", token: "stripe" }, // not a target
  { company: "Google LLC", ats: "greenhouse", token: "google" }, // legal suffix stripped
  { company: "SIG", ats: "lever", token: "sig" }, // parenthetical content
  { company: "D.E. Shaw", ats: "greenhouse", token: "deshaw" }, // punctuation collapsed
  { company: "Alphabet", ats: "ashby", token: "alphabet" }, // alias key
  { company: "Optum", ats: "workday", host: "x", tenant: "y", site: "z" }, // parenthetical content
  { company: "Databricks", ats: "greenhouse", token: "databricks" }, // not a target
  { company: "JPMorgan", ats: "oracle", host: "h", site: "s" }, // alias key
];

test("normName collapses case, punctuation, legal suffixes, & and parentheticals", () => {
  assert.equal(normName("Google LLC"), "google");
  assert.equal(normName("D.E. Shaw"), normName("D. E. Shaw"));
  assert.equal(normName("Susquehanna (SIG)"), "susquehanna");
  assert.equal(normName("Procter & Gamble"), "procterandgamble");
  assert.equal(normName("The Trade Desk, Inc."), "tradedesk");
  assert.equal(normName(""), "");
});

test("hot tier keeps only endpoints whose company resolves to a target", () => {
  const hot = filterTier(endpoints, targets, "hot");
  assert.deepEqual(
    hot.map((e) => e.company),
    ["Google LLC", "SIG", "D.E. Shaw", "Alphabet", "Optum", "JPMorgan"],
  );
  // Same objects, same relative order — never copies or reorders.
  assert.equal(hot[0], endpoints[1]);
});

test("full tier returns every endpoint unchanged", () => {
  const full = filterTier(endpoints, targets, "full");
  assert.deepEqual(full, endpoints);
  assert.equal(full.length, endpoints.length);
});

test("hot tier with an empty targets file selects nothing", () => {
  assert.deepEqual(filterTier(endpoints, {}, "hot"), []);
});
