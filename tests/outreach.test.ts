import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOutreachChannel } from "../lib/outreach.ts";

// L8 audit item 4d: addOutreachAction validates `channel` against the real
// OUTREACH_CHANNELS enum instead of trusting whatever a raw POST sends.
test("parseOutreachChannel accepts the two real channels", () => {
  assert.equal(parseOutreachChannel("linkedin"), "linkedin");
  assert.equal(parseOutreachChannel("email"), "email");
});

test("parseOutreachChannel rejects anything else", () => {
  assert.equal(parseOutreachChannel("carrier-pigeon"), null);
  assert.equal(parseOutreachChannel(""), null);
  assert.equal(parseOutreachChannel("LinkedIn"), null); // case-sensitive, matches the enum exactly
});
