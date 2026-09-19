import { test } from "node:test";
import assert from "node:assert/strict";
import {
  labelTask,
  summarizeLabels,
  HUMAN_LED_MAX,
  AUTOMATABLE_MIN,
  LABELS,
} from "../lib/exposure.ts";

test("no exposure row is unscored, never a guess", () => {
  assert.equal(labelTask(undefined), "unscored");
  assert.equal(labelTask(null), "unscored");
});

test("automation_share at the human_led boundary maps to human_led", () => {
  assert.equal(labelTask({ automation_share: HUMAN_LED_MAX, augmentation_share: 1 - HUMAN_LED_MAX }), "human_led");
  assert.equal(labelTask({ automation_share: 0, augmentation_share: 1 }), "human_led");
});

test("automation_share just above the human_led boundary is ai_assisted", () => {
  const above = HUMAN_LED_MAX + 0.01;
  assert.equal(labelTask({ automation_share: above, augmentation_share: 1 - above }), "ai_assisted");
});

test("automation_share at the automatable boundary maps to automatable", () => {
  assert.equal(
    labelTask({ automation_share: AUTOMATABLE_MIN, augmentation_share: 1 - AUTOMATABLE_MIN }),
    "automatable",
  );
  assert.equal(labelTask({ automation_share: 1, augmentation_share: 0 }), "automatable");
});

test("automation_share just below the automatable boundary is ai_assisted", () => {
  const below = AUTOMATABLE_MIN - 0.01;
  assert.equal(labelTask({ automation_share: below, augmentation_share: 1 - below }), "ai_assisted");
});

test("mid-range automation_share is ai_assisted", () => {
  assert.equal(labelTask({ automation_share: 0.5, augmentation_share: 0.5 }), "ai_assisted");
});

test("every non-unscored label has a one-line definition", () => {
  for (const key of ["human_led", "ai_assisted", "automatable"] as const) {
    assert.equal(typeof LABELS[key], "string");
    assert.ok(LABELS[key].length > 0);
  }
});

test("summarizeLabels counts each bucket", () => {
  const summary = summarizeLabels(["human_led", "ai_assisted", "ai_assisted", "automatable", "unscored"]);
  assert.deepEqual(summary, { human_led: 1, ai_assisted: 2, automatable: 1, unscored: 1 });
});

test("summarizeLabels on an empty list is all zero", () => {
  assert.deepEqual(summarizeLabels([]), { human_led: 0, ai_assisted: 0, automatable: 0, unscored: 0 });
});
