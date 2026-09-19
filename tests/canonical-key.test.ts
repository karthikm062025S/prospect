import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveCanonicalKey } from "../lib/upsert-role.ts";

// T3 (MISSION Task 3): the ATS job id parsed from the link is the identity;
// falls back to company + normalized title + normalized location. Locks
// deriveCanonicalKey the same way tests/upsert-role.test.ts locks
// isTargetTitle/ingestSeason/ingestFamily.

const base = { companyId: "co-1", title: "Software Engineer Intern", location: null as string | null };

test("Workday _R id", () => {
  const key = deriveCanonicalKey({
    ...base,
    link: "https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Remote/Software-Engineer-Intern_R01171049",
  });
  assert.equal(key, "wd:R01171049");
});

test("Workday _JR id", () => {
  const key = deriveCanonicalKey({
    ...base,
    link: "https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Software-Engineer-Intern_JR0012345",
  });
  assert.equal(key, "wd:JR0012345");
});

// Task 3 done-gate P1-1 fix (2026-09-16): the extractAtsId regex now accepts a
// hyphen/underscore between the JR|R prefix and the digits, anchored so a
// trailing tracking query string never changes the extracted id.
test("Workday _R id with a hyphen separator and a trailing tracking query string", () => {
  const key = deriveCanonicalKey({
    ...base,
    link: "https://x.wd5.myworkdayjobs.com/en-US/careers/job/Loc/Title_R-123456?utm=1",
  });
  assert.equal(key, "wd:R-123456");
});

test("Workday _JR id with an underscore separator", () => {
  const key = deriveCanonicalKey({
    ...base,
    link: "https://x.wd5.myworkdayjobs.com/en-US/careers/job/Loc/Title_JR_12345",
  });
  assert.equal(key, "wd:JR_12345");
});

test("a Workday id survives a tracking query string appended after it", () => {
  const plain = deriveCanonicalKey({
    ...base,
    link: "https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Remote/Software-Engineer-Intern_R01171049",
  });
  const tracked = deriveCanonicalKey({
    ...base,
    link: "https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Remote/Software-Engineer-Intern_R01171049?utm_source=simplify",
  });
  assert.equal(tracked, plain, "a ?utm_source= tracking query must not change the derived key");
});

test("Greenhouse job id", () => {
  const key = deriveCanonicalKey({ ...base, link: "https://boards.greenhouse.io/acme/jobs/1234567" });
  assert.equal(key, "gh:1234567");
});

test("Lever uuid", () => {
  const key = deriveCanonicalKey({
    ...base,
    link: "https://jobs.lever.co/acme/12345678-90ab-cdef-1234-567890abcdef",
  });
  assert.equal(key, "lever:12345678-90ab-cdef-1234-567890abcdef");
});

test("Ashby postings id", () => {
  const key = deriveCanonicalKey({ ...base, link: "https://jobs.ashbyhq.com/acme/postings/abcde12345" });
  assert.equal(key, "ashby:abcde12345");
});

test("SmartRecruiters job id", () => {
  const key = deriveCanonicalKey({ ...base, link: "https://careers.smartrecruiters.com/Acme/job/123456789" });
  assert.equal(key, "sr:123456789");
});

test("SuccessFactors numeric id", () => {
  const key = deriveCanonicalKey({ ...base, link: "https://acme.successfactors.com/career/job/998877" });
  assert.equal(key, "sf:998877");
});

test("a link with none of the known ATS hosts falls back to company+title+location", () => {
  const key = deriveCanonicalKey({ ...base, link: "https://boards.example.com/some/random/posting" });
  assert.equal(key, "co:co-1|t:software engineer intern|l:-");
});

test("a null link falls back to company+title+location", () => {
  const key = deriveCanonicalKey({ ...base, link: null });
  assert.equal(key, "co:co-1|t:software engineer intern|l:-");
});

test("title and location normalize to the same key regardless of case, punctuation, and whitespace", () => {
  const a = deriveCanonicalKey({
    companyId: "co-1",
    title: "SDE Intern, Summer 2027",
    location: "  New   York, NY  ",
    link: null,
  });
  const b = deriveCanonicalKey({
    companyId: "co-1",
    title: "sde intern summer 2027",
    location: "new york ny",
    link: null,
  });
  assert.equal(a, b);
});

test("a real location distinguishes two postings that share a title in different cities", () => {
  const ny = deriveCanonicalKey({ companyId: "co-1", title: "Software Engineer Intern", location: "New York, NY", link: null });
  const sf = deriveCanonicalKey({
    companyId: "co-1",
    title: "Software Engineer Intern",
    location: "San Francisco, CA",
    link: null,
  });
  assert.notEqual(ny, sf);
});
