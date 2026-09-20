import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlanNode, validatePlan, parseCertLines, parsePlanResponse } from "../lib/agents/roadmap.ts";

function ctx(overrides: Partial<Parameters<typeof validatePlanNode>[1]> = {}) {
  return {
    courseCodes: new Set(["CS 3114"]),
    clubNames: new Set(["ACM"]),
    certsByName: new Map([
      ["AWS Cloud Practitioner", { name: "AWS Cloud Practitioner", why: "widely recognized", sourceUrl: "https://aws.amazon.com/certification/" }],
    ]),
    ...overrides,
  };
}

test("a course node with a known code is accepted and carries ref_code", () => {
  const node = { semester: "Fall 2026", kind: "course" as const, ref: "CS 3114", title: "Data Structures", why: "core requirement", movesToward: [] };
  const result = validatePlanNode(node, ctx());
  assert.equal(result.kind, "course");
  assert.equal(result.refCode, "CS 3114");
  assert.equal(result.refName, null);
});

test("a course node with an unknown code is rejected, naming the code", () => {
  const node = { semester: "Fall 2026", kind: "course" as const, ref: "CS 9999", title: "Fake Course", why: "x", movesToward: [] };
  assert.throws(() => validatePlanNode(node, ctx()), /Course not found in catalog: CS 9999/);
});

test("a course node with no ref is rejected, naming the title", () => {
  const node = { semester: "Fall 2026", kind: "course" as const, ref: null, title: "Untitled", why: "x", movesToward: [] };
  assert.throws(() => validatePlanNode(node, ctx()), /Roadmap plan proposed a course node with no ref_code: "Untitled"/);
});

test("a club node with an unknown name is rejected, naming the name", () => {
  const node = { semester: "Fall 2026", kind: "club" as const, ref: "Not A Real Club", title: "x", why: "x", movesToward: [] };
  assert.throws(() => validatePlanNode(node, ctx()), /Club not found in catalog: Not A Real Club/);
});

test("a club node with a known name is accepted and carries ref_name", () => {
  const node = { semester: "Fall 2026", kind: "club" as const, ref: "ACM", title: "Join ACM", why: "community", movesToward: ["Backend Software Engineer"] };
  const result = validatePlanNode(node, ctx());
  assert.equal(result.kind, "club");
  assert.equal(result.refName, "ACM");
  assert.deepEqual(result.movesToward, ["Backend Software Engineer"]);
});

test("a certification node without a matching grounded source_url is rejected", () => {
  const node = { semester: "Fall 2026", kind: "certification" as const, ref: "Made Up Cert", title: "x", why: "x", movesToward: [] };
  assert.throws(() => validatePlanNode(node, ctx()), /Certification node has no grounded source_url: "x"/);
});

test("a certification node with no ref at all is rejected", () => {
  const node = { semester: "Fall 2026", kind: "certification" as const, ref: null, title: "x", why: "x", movesToward: [] };
  assert.throws(() => validatePlanNode(node, ctx()), /Certification node has no grounded source_url/);
});

test("a certification node matching a grounded cert carries its source_url", () => {
  const node = { semester: "Fall 2026", kind: "certification" as const, ref: "AWS Cloud Practitioner", title: "Get AWS certified", why: "cloud fundamentals", movesToward: [] };
  const result = validatePlanNode(node, ctx());
  assert.equal(result.sourceUrl, "https://aws.amazon.com/certification/");
  assert.equal(result.refName, "AWS Cloud Practitioner");
});

test("a project node is always accepted, status-suggested shape, with no ref", () => {
  const node = { semester: "Fall 2026", kind: "project" as const, ref: null, title: "Build a resume parser", why: "practice NLP", movesToward: [] };
  const result = validatePlanNode(node, ctx());
  assert.equal(result.kind, "project");
  assert.equal(result.refCode, null);
  assert.equal(result.refName, null);
  assert.equal(result.sourceUrl, null);
});

test("parseCertLines keeps only well-formed lines with a real http(s) URL", () => {
  const text = [
    "AWS Cloud Practitioner | widely recognized | https://aws.amazon.com/certification/",
    "not a valid line at all",
    "Missing URL | why | not-a-url",
    "CompTIA Security+ | entry-level security | http://comptia.org/security-plus",
  ].join("\n");
  const certs = parseCertLines(text);
  assert.equal(certs.length, 2);
  assert.equal(certs[0].name, "AWS Cloud Practitioner");
  assert.equal(certs[1].sourceUrl, "http://comptia.org/security-plus");
});

test("parseCertLines caps at 3 certifications", () => {
  const text = Array.from({ length: 5 }, (_, i) => `Cert ${i} | why | https://example.edu/${i}`).join("\n");
  assert.equal(parseCertLines(text).length, 3);
});

test("parseCertLines returns an empty array for empty or all-invalid text", () => {
  assert.deepEqual(parseCertLines(""), []);
  assert.deepEqual(parseCertLines("nothing found"), []);
});

test("parsePlanResponse parses a valid JSON array into PlanNode shapes", () => {
  const text = JSON.stringify([
    { semester: "Fall 2026", kind: "course", ref: "CS 3114", title: "Data Structures", why: "core", movesToward: ["Backend Software Engineer"] },
  ]);
  const nodes = parsePlanResponse(text);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].ref, "CS 3114");
});

test("parsePlanResponse throws on malformed JSON rather than guessing", () => {
  assert.throws(() => parsePlanResponse("not json"));
});

test("parsePlanResponse throws when a node is missing a required field", () => {
  const text = JSON.stringify([{ semester: "Fall 2026", kind: "course" }]);
  assert.throws(() => parsePlanResponse(text));
});

test("validatePlan drops a bad node and keeps the good one, naming the drop", () => {
  const plan = [
    { semester: "Fall 2026", kind: "course" as const, ref: "CS 3114", title: "Data Structures", why: "core requirement", movesToward: [] },
    { semester: "Fall 2026", kind: "course" as const, ref: "CS 9999", title: "Fake Course", why: "x", movesToward: [] },
  ];
  const { validated, dropped } = validatePlan(plan, ctx());
  assert.equal(validated.length, 1);
  assert.match(dropped[0], /Course not found in catalog: CS 9999/);
});

test("validatePlan throws ROADMAP_EMPTY when every node fails catalog validation", () => {
  const plan = [
    { semester: "Fall 2026", kind: "course" as const, ref: "CS 9999", title: "Fake Course", why: "x", movesToward: [] },
    { semester: "Fall 2026", kind: "club" as const, ref: "Not A Real Club", title: "x", why: "x", movesToward: [] },
  ];
  assert.throws(() => validatePlan(plan, ctx()), /ROADMAP_EMPTY/);
});
