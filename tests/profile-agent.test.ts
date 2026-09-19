import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ProfileSchema,
  normalizeCourseCode,
  courseCountLabel,
  skillsExperienceLabel,
  encodeStepLine,
} from "../lib/agents/profile.ts";
import { gemini } from "../lib/gemini.ts";

const VALID_BASE = {
  major: "Computer Science",
  gradTerm: "Spring 2028",
  workAuthorization: "F-1 (CPT/OPT)",
  courses: [{ code: "CS 3114", title: "Data Structures and Algorithms" }],
  skills: ["TypeScript", "React"],
  experiences: [{ org: "Acme", title: "SWE Intern", summary: "Built things." }],
  roleTypes: ["internship"],
  targetTerm: { season: "Summer", year: 2027 },
  goal: "Land a backend SWE internship.",
  dreamTier: ["FAANG"],
};

test("ProfileSchema rejects zero courses AND zero typed courses, naming the transcript file", () => {
  const result = ProfileSchema({}).safeParse({ ...VALID_BASE, courses: [] });
  assert.equal(result.success, false);
  assert.ok(result.error);
  assert.match(result.error.issues[0].message, /Transcript parse found 0 courses in transcript\.pdf/);
});

test("ProfileSchema rejects zero courses even when typedCourses is only whitespace", () => {
  const result = ProfileSchema({ typedCourses: "   " }).safeParse({ ...VALID_BASE, courses: [] });
  assert.equal(result.success, false);
});

test("ProfileSchema accepts zero parsed courses when the student typed courses instead", () => {
  const result = ProfileSchema({ typedCourses: "CS 3114, MATH 2114" }).safeParse({ ...VALID_BASE, courses: [] });
  assert.equal(result.success, true);
});

test("ProfileSchema accepts a valid profile with parsed courses", () => {
  const result = ProfileSchema({}).safeParse(VALID_BASE);
  assert.equal(result.success, true);
});

test("normalizeCourseCode normalizes subject+number into 'SUBJ NNNN'", () => {
  assert.equal(normalizeCourseCode("CS3114"), "CS 3114");
  assert.equal(normalizeCourseCode("cs 3114"), "CS 3114");
  assert.equal(normalizeCourseCode("CS-3114"), "CS 3114");
  assert.equal(normalizeCourseCode("MATH2114"), "MATH 2114");
  assert.equal(normalizeCourseCode("already fine"), "already fine");
});

test("courseCountLabel and skillsExperienceLabel embed the real counts as digits", () => {
  assert.equal(courseCountLabel(14), "14 courses found");
  assert.equal(courseCountLabel(1), "1 course found");
  assert.equal(skillsExperienceLabel(6, 3), "6 skills, 3 experiences found");
  assert.equal(skillsExperienceLabel(1, 1), "1 skill, 1 experience found");
});

test("encodeStepLine's NDJSON line carries the label with the count's digits", () => {
  const line = encodeStepLine({ step: "transcript", label: courseCountLabel(14), count: 14 });
  assert.equal(line.endsWith("\n"), true);
  const parsed = JSON.parse(line.trim());
  assert.equal(parsed.step, "transcript");
  assert.match(parsed.label, /14/);
  assert.equal(parsed.count, 14);
});

test("gemini() throws a named error when GEMINI_API_KEY is unset", () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    assert.throws(() => gemini(), /^Error: GEMINI_API_KEY is not set$/);
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  }
});
