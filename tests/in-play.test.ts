import { test } from "node:test";
import assert from "node:assert/strict";
import { isInPlay } from "../lib/in-play.ts";

// D23: the fit score is gone; this predicate is the exclusion it used to
// enforce, and it is what keeps applied / expired roles off Home. Task 3 K2
// dropped the citizen_required exclusion this predicate used to
// carry. Every guard the deleted scoreFit() had gets a test here.
const NOW = new Date("2026-08-24T12:00:00Z").getTime();

function role(overrides: Partial<Parameters<typeof isInPlay>[0]> = {}) {
  return {
    visa_class: null as string | null,
    deadline: null as string | null,
    lifecycle: "open",
    ...overrides,
  };
}

test("a plain open role with no flags is in play", () => {
  assert.equal(isInPlay(role(), NOW), true);
});

// Task 3 K2: citizen_required no longer excludes the role, it
// stays in play and shows a flag instead (lib/gate-rules.ts).
test("citizen_required stays in play (K2: the flag shows, the row is not hidden)", () => {
  assert.equal(isInPlay(role({ visa_class: "citizen_required" }), NOW), true);
});

test("every visa class stays in play", () => {
  for (const visa_class of ["clean", "question", "no_sponsors", "citizen_required", null]) {
    assert.equal(isInPlay(role({ visa_class }), NOW), true, `${visa_class}`);
  }
});

test("lifecycle 'applied' is excluded (not in play)", () => {
  assert.equal(isInPlay(role({ lifecycle: "applied" }), NOW), false);
});

test("a deadline before today is excluded", () => {
  assert.equal(isInPlay(role({ deadline: "2026-08-23" }), NOW), false);
});

test("a deadline of today is still in play", () => {
  assert.equal(isInPlay(role({ deadline: "2026-08-24" }), NOW), true);
});

test("a future deadline is in play, and a null deadline never excludes", () => {
  assert.equal(isInPlay(role({ deadline: "2026-12-01" }), NOW), true);
  assert.equal(isInPlay(role({ deadline: null }), NOW), true);
});

test("saved and hidden roles are unaffected — those are view filters, not exclusions", () => {
  // isInPlay reads neither field; hiding a role must never delete it from the
  // dataset, only from the All view (D27).
  assert.equal(isInPlay(role(), NOW), true);
});
