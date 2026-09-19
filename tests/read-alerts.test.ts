import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseAlertEmail,
  ingestCandidates,
  loadContext,
  detectSource,
  normName,
} from "../scripts/read-alerts.mjs";

// Fixture emails model the real per-source templates (research 2026-07-12). Each
// digest bakes in the required cases: happy target rows, a malformed/CTA card, a
// wrong-term row, a geo (non-US) row, and a scanner-covered row. The tests run
// the SAME path main() runs: parseAlertEmail -> ingestCandidates over the real
// targets.json + endpoints.json context.
const here = dirname(fileURLToPath(import.meta.url));
const readFx = (name: string) => readFile(join(here, "fixtures", "alerts", name), "utf8");

let ctxCache: Awaited<ReturnType<typeof loadContext>> | undefined;
const getCtx = async () => (ctxCache ??= await loadContext());

async function ingestFixture(file: string, source: string) {
  const raw = await readFx(file);
  const cands = await parseAlertEmail(raw, source);
  const ctx = await getCtx();
  const res = ingestCandidates(
    cands.map((cand: unknown) => ({ cand, source })),
    ctx,
  );
  return { cands, ...res };
}

type Role = { company: string; [k: string]: unknown };
const byCompany = (roles: Role[]) => Object.fromEntries(roles.map((r) => [r.company, r]));

test("LinkedIn digest: targets survive; geo, wrong-term, non-SWE dropped; scanner-covered skipped", async () => {
  const { cands, roles, skippedScanner, dropped } = await ingestFixture("linkedin.eml", "linkedin");
  assert.equal(cands.length, 6, "all six cards parse into candidates");

  assert.deepEqual(roles.map((r) => r.company).sort(), ["Citadel", "Google"]);
  const by = byCompany(roles);
  assert.equal(by["Google"].source, "alert-target:linkedin"); // giant → mandatory tailoring
  assert.equal(by["Google"].role_type, "SWE");
  assert.equal(by["Google"].posted_at, null); // dedup on (company,title) across digests
  assert.equal(by["Google"].link, "https://www.linkedin.com/jobs/view/3811000001"); // canonical, /comm/ stripped
  assert.equal(by["Citadel"].source, "alert-target:linkedin");
  assert.equal(by["Citadel"].role_type, "AI");

  assert.equal(skippedScanner, 1, "Stripe is scanner-covered → skipped, not duplicated");
  assert.equal(dropped, 3, "Revolut (London geo) + Netflix (Fall 2026 term) + Meta (Marketing function)");
});

test("Indeed: two targets + one non-target; jk canonicalized to /viewjob", async () => {
  const { cands, roles } = await ingestFixture("indeed.eml", "indeed");
  assert.equal(cands.length, 3);
  assert.deepEqual(roles.map((r) => r.company).sort(), ["Citadel Securities", "Foobar Labs", "Two Sigma"]);
  const by = byCompany(roles);
  assert.equal(by["Two Sigma"].source, "alert-target:indeed");
  assert.equal(by["Two Sigma"].role_type, "SWE");
  assert.equal(by["Two Sigma"].link, "https://www.indeed.com/viewjob?jk=aa11bb22cc33dd44");
  assert.equal(by["Citadel Securities"].role_type, "Quant");
  assert.equal(by["Citadel Securities"].source, "alert-target:indeed");
  assert.equal(by["Foobar Labs"].source, "alert:indeed"); // not on target list → no mandatory-tailoring tag
});

test("Handshake: target survives; CTA-only card yields no candidate", async () => {
  const { cands, roles } = await ingestFixture("handshake.eml", "handshake");
  assert.equal(cands.length, 1, "the 'View job' CTA card is not a role");
  assert.equal(roles.length, 1);
  // Netflix was here, but it's now scanner-covered (Eightfold) so read-alerts skips it
  // (one-lane partition). Citadel is a target that stays alert-only (not pollable).
  assert.equal(roles[0].company, "Citadel");
  assert.equal(roles[0].role_type, "Data");
  assert.equal(roles[0].source, "alert-target:handshake");
});

test("Direct employer email: company comes from the sender, tagged as target", async () => {
  const { roles } = await ingestFixture("direct.eml", "direct");
  assert.equal(roles.length, 1);
  assert.equal(roles[0].company, "Google"); // "Google Careers" sender → "Google"
  assert.equal(roles[0].source, "alert-target:direct");
  assert.equal(roles[0].role_type, "SWE");
});

test("Malformed / unknown-format email: no candidates, no throw", async () => {
  const raw = await readFx("malformed.eml");
  const cands = await parseAlertEmail(raw, detectSource("newsletter@thedailybyte.example"));
  assert.deepEqual(cands, []);
});

test("detectSource routes by sender address", () => {
  assert.equal(detectSource("jobalerts-noreply@linkedin.com"), "linkedin");
  assert.equal(detectSource("alert@indeed.com"), "indeed");
  assert.equal(detectSource("handshake@notifications.joinhandshake.com"), "handshake");
  assert.equal(detectSource("careers-noreply@google.com"), "direct");
  assert.equal(detectSource(""), "direct");
});

test("normName resolves punctuation/suffix variants to one target key", () => {
  assert.equal(normName("D.E. Shaw"), normName("D. E. Shaw"));
  assert.equal(normName("Google LLC"), normName("Google"));
  assert.equal(normName("JPMorgan Chase"), "jpmorganchase");
  assert.equal(normName("Susquehanna (SIG)"), "susquehanna"); // parenthetical dropped
});

test("target matching resolves decorated / aliased company names (FR-009 tag must fire)", async () => {
  const ctx = await getCtx();
  const resolve = (name: string) => ctx.targets.get(normName(name));
  const cases: [string, string][] = [
    ["Walmart", "Walmart Global Tech"],
    ["Susquehanna", "Susquehanna (SIG)"],
    ["SIG", "Susquehanna (SIG)"],
    ["Cigna", "Cigna (Evernorth)"],
    ["Evernorth", "Cigna (Evernorth)"],
    ["JPMorgan", "JPMorgan Chase"],
    ["J.P. Morgan", "JPMorgan Chase"],
    ["Optum", "UnitedHealth Group (Optum)"],
    ["Cursor", "Cursor (Anysphere)"],
    ["Anysphere", "Cursor (Anysphere)"],
    ["Alphabet", "Google"],
    ["Meta Platforms", "Meta"],
    ["The D. E. Shaw Group", "D. E. Shaw"],
  ];
  for (const [alertName, canonical] of cases) {
    const hit = resolve(alertName);
    assert.ok(hit, `"${alertName}" should resolve to a mandatory-tailoring target`);
    assert.equal(hit.canonical, canonical, `"${alertName}" → ${canonical}`);
  }
  // And a distinct-firm collision must NOT be created by the paren/suffix stripping.
  assert.equal(resolve("Citadel")?.canonical, "Citadel");
  assert.equal(resolve("Citadel Securities")?.canonical, "Citadel Securities");
});

test("alert roles never emit demoting fields (mirror scanner B1: no re-post clobber)", async () => {
  const { roles } = await ingestFixture("linkedin.eml", "linkedin");
  assert.ok(roles.length > 0);
  for (const r of roles) {
    for (const forbidden of ["lifecycle", "eligible", "eligibility_note", "fit_note", "priority", "notes"]) {
      assert.ok(!(forbidden in r), `alert role must not emit "${forbidden}"`);
    }
    assert.equal(r.posted_at, null);
  }
});
