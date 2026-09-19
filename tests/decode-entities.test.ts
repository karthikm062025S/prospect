import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities } from "../lib/decode-entities.ts";

test("decodes named and numeric entities, leaves the rest alone", () => {
  assert.equal(decodeEntities("Event Technology &amp; Digital"), "Event Technology & Digital");
  assert.equal(decodeEntities("A &#38; B &#x26; C"), "A & B & C");
  assert.equal(decodeEntities("R&amp;D &lt;intern&gt;"), "R&D <intern>");
  assert.equal(decodeEntities("no entities & plain"), "no entities & plain");
  assert.equal(decodeEntities("&unknown;"), "&unknown;");
});
