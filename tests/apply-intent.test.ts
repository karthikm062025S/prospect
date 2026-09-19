import { test } from "node:test";
import assert from "node:assert/strict";
import { applyControlState, nextApplyClickedAt } from "../lib/apply-intent.ts";

// RB-013: confirming iff the role is still open AND a click has been stamped.
// No expiry — all four lifecycle x apply_clicked_at combos, nothing else.
test("applyControlState: open + stamped -> confirming", () => {
  assert.equal(applyControlState({ lifecycle: "open", apply_clicked_at: "2026-08-23T10:00:00Z" }), "confirming");
});

test("applyControlState: open + null -> idle", () => {
  assert.equal(applyControlState({ lifecycle: "open", apply_clicked_at: null }), "idle");
});

test("applyControlState: applied + stamped -> idle (a real apply always wins)", () => {
  assert.equal(applyControlState({ lifecycle: "applied", apply_clicked_at: "2026-08-23T10:00:00Z" }), "idle");
});

test("applyControlState: applied + null -> idle", () => {
  assert.equal(applyControlState({ lifecycle: "applied", apply_clicked_at: null }), "idle");
});

// RB-010/012: "apply" stamps now (opens the link + arms confirmation in one
// action); "not_yet" clears with no record.
test("nextApplyClickedAt: apply stamps the given now", () => {
  assert.equal(nextApplyClickedAt("apply", "2026-08-23T10:00:00Z"), "2026-08-23T10:00:00Z");
});

test("nextApplyClickedAt: not_yet clears to null", () => {
  assert.equal(nextApplyClickedAt("not_yet", "2026-08-23T10:00:00Z"), null);
});
