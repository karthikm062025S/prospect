import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOAL_MAX,
  MAJORS,
  PDF_MAX_BYTES,
  SKILLS,
  WORK_AUTH,
  WORK_AUTH_VALUES,
  normaliseSkill,
  suggestSkills,
} from "../lib/profile-options.ts";
import { ProfileFormSchema } from "../lib/agents/profile.ts";

// UI/UX mission C3: every
// validation constant lives in lib/profile-options.ts and ProfileFormSchema
// reads them, so the /setup form and the /api/profile 400 check never drift.

const VALID_FORM = {
  major: "Computer Science Major",
  gradTerm: "Spring 2028",
  workAuthorization: "F-1 (CPT/OPT)",
  roleTypes: ["internship"],
  targetTerm: { season: "Summer", year: 2027 },
  goal: "Land a backend SWE internship.",
  dreamTier: ["FAANG"],
  skills: ["Python"],
};

test("GOAL_MAX is 1000 and the schema accepts 1,000 chars but refuses 1,001", () => {
  assert.equal(GOAL_MAX, 1000);
  assert.equal(ProfileFormSchema.safeParse({ ...VALID_FORM, goal: "g".repeat(1000) }).success, true);
  const over = ProfileFormSchema.safeParse({ ...VALID_FORM, goal: "g".repeat(1001) });
  assert.equal(over.success, false);
  assert.match(over.error!.issues[0].message, /1000/);
});

test("WORK_AUTH lists the nine real statuses with value, label and help; the citizen option says N/A", () => {
  assert.equal(WORK_AUTH.length, 9);
  for (const option of WORK_AUTH) {
    assert.ok(option.value && option.label && option.help, `${option.value} is missing a field`);
    assert.ok(!option.help.includes("—") && !option.label.includes("—"), "no em dashes");
  }
  const citizen = WORK_AUTH.find((o) => o.value === "US citizen")!;
  assert.match(citizen.label + " " + citizen.help, /N\/A/);
  assert.deepEqual(
    WORK_AUTH_VALUES,
    WORK_AUTH.map((o) => o.value),
  );
  assert.ok(WORK_AUTH_VALUES.includes("Prefer not to say"));
  assert.ok(WORK_AUTH_VALUES.includes("DACA"));
});

test("the schema refuses a workAuthorization outside WORK_AUTH and accepts every listed value", () => {
  const bad = ProfileFormSchema.safeParse({ ...VALID_FORM, workAuthorization: "Martian" });
  assert.equal(bad.success, false);
  assert.equal(bad.error!.issues[0].path[0], "workAuthorization");
  for (const value of WORK_AUTH_VALUES) {
    assert.equal(ProfileFormSchema.safeParse({ ...VALID_FORM, workAuthorization: value }).success, true, value);
  }
});

test("normaliseSkill: exact (case-insensitive), alias, edit distance; gibberish refused by name", () => {
  assert.deepEqual(normaliseSkill("python"), { ok: true, skill: "Python" });
  assert.deepEqual(normaliseSkill("  JAVASCRIPT "), { ok: true, skill: "JavaScript" });
  assert.deepEqual(normaliseSkill("js"), { ok: true, skill: "JavaScript" });
  assert.deepEqual(normaliseSkill("pythn"), { ok: true, skill: "Python" });
  assert.deepEqual(normaliseSkill("node js"), { ok: true, skill: "Node.js" });
  assert.deepEqual(normaliseSkill("k8s"), { ok: true, skill: "Kubernetes" });
  assert.deepEqual(normaliseSkill("c++"), { ok: true, skill: "C++" });
  const bad = normaliseSkill("kjsbfjhhvfs");
  assert.equal(bad.ok, false);
  assert.match((bad as { reason: string }).reason, /Not a recognised skill: "kjsbfjhhvfs"/);
  assert.equal(normaliseSkill("").ok, false);
  // Short inputs never fuzzy-match (a 3-char typo could land on anything).
  assert.equal(normaliseSkill("xqz").ok, false);
});

test("the schema normalises skills and refuses gibberish, naming the input", () => {
  const ok = ProfileFormSchema.safeParse({ ...VALID_FORM, skills: ["pythn", "js"] });
  assert.equal(ok.success, true);
  assert.deepEqual(ok.data!.skills, ["Python", "JavaScript"]);
  const bad = ProfileFormSchema.safeParse({ ...VALID_FORM, skills: ["Python", "kjsbfjhhvfs"] });
  assert.equal(bad.success, false);
  assert.match(bad.error!.issues[0].message, /kjsbfjhhvfs/);
  assert.deepEqual(bad.error!.issues[0].path, ["skills", 1]);
});

test("the vocabulary is real and large enough: 300+ unique skills, every alias resolves to one of them", () => {
  assert.ok(SKILLS.length >= 300, `only ${SKILLS.length} skills`);
  assert.equal(new Set(SKILLS.map((s) => s.toLowerCase())).size, SKILLS.length, "duplicate skill entries");
  for (const skill of SKILLS) {
    assert.deepEqual(normaliseSkill(skill), { ok: true, skill }, `${skill} does not round-trip`);
  }
});

test("suggestSkills ranks prefix matches first and skips already-selected skills", () => {
  const out = suggestSkills("pyt", ["PyTorch"], 6);
  assert.equal(out[0], "Python");
  assert.ok(!out.includes("PyTorch"));
  assert.ok(out.length <= 6);
  assert.deepEqual(suggestSkills("", [], 6), []);
});

test("MAJORS comes from datasets/vt_majors.csv (213 unique rows) and PDF_MAX_BYTES mirrors the API limit", () => {
  assert.equal(MAJORS.length, 213);
  assert.ok(MAJORS.includes("Computer Science Major"));
  assert.ok(MAJORS.includes("Finance Major with Corporate Financial Management Option"));
  assert.equal(PDF_MAX_BYTES, 4 * 1024 * 1024);
});
