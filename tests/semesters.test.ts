import { test } from "node:test";
import assert from "node:assert/strict";
import { semestersBetween, semestersFromTerm, seasonFromDate, parseSemesterLabel } from "../lib/semesters.ts";

test("semestersBetween walks Fall 2026 -> Spring 2027 -> Summer 2027 from 2026-09-19", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  assert.deepEqual(semestersBetween(now, { season: "Summer", year: 2027 }), [
    "Fall 2026",
    "Spring 2027",
    "Summer 2027",
  ]);
});

test("seasonFromDate maps January to Spring and December to Fall", () => {
  assert.equal(seasonFromDate(new Date("2026-01-15T12:00:00Z")), "Spring");
  assert.equal(seasonFromDate(new Date("2026-12-01T12:00:00Z")), "Fall");
});

test("seasonFromDate resolves the Jun/Jul Summer and Aug+ Fall boundary", () => {
  assert.equal(seasonFromDate(new Date("2026-07-15T12:00:00Z")), "Summer");
  assert.equal(seasonFromDate(new Date("2026-08-15T12:00:00Z")), "Fall");
});

test("semestersBetween with the target term equal to the current term returns exactly one semester", () => {
  const now = new Date("2027-02-01T12:00:00Z");
  assert.deepEqual(semestersBetween(now, { season: "Spring", year: 2027 }), ["Spring 2027"]);
});

test("semestersBetween throws when the target term is before the current term", () => {
  const now = new Date("2027-09-01T12:00:00Z");
  assert.throws(() => semestersBetween(now, { season: "Fall", year: 2026 }), /is before the current term/);
});

test("semestersFromTerm walks a full year across a year rollover", () => {
  assert.deepEqual(semestersFromTerm({ season: "Fall", year: 2026 }, { season: "Fall", year: 2027 }), [
    "Fall 2026",
    "Spring 2027",
    "Summer 2027",
    "Fall 2027",
  ]);
});

test("semestersFromTerm throws naming an unknown season", () => {
  assert.throws(() => semestersFromTerm({ season: "Winter", year: 2026 }, { season: "Fall", year: 2026 }), /Unknown term season: Winter/);
});

test("parseSemesterLabel parses a 'Season YYYY' label", () => {
  assert.deepEqual(parseSemesterLabel("Fall 2026"), { season: "Fall", year: 2026 });
  assert.deepEqual(parseSemesterLabel("  Spring 2028  "), { season: "Spring", year: 2028 });
});

test("parseSemesterLabel throws naming an unrecognized label", () => {
  assert.throws(() => parseSemesterLabel("Whenever"), /Unrecognized semester label: Whenever/);
});
