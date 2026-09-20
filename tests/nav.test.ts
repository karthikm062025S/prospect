import { test } from "node:test";
import assert from "node:assert/strict";
import { NAV, isActive } from "../lib/nav.ts";

test("NAV lists the three shell tabs in order, Journey right after Home", () => {
  assert.deepEqual(
    NAV.map((item) => item.href),
    ["/", "/journey", "/applications"],
  );
});

test("root is active only on an exact match", () => {
  assert.equal(isActive("/", "/"), true);
  assert.equal(isActive("/applications", "/"), false);
});

test("non-root hrefs match their whole subtree", () => {
  assert.equal(isActive("/applications", "/applications"), true);
  assert.equal(isActive("/applications/123", "/applications"), true);
  assert.equal(isActive("/outreach", "/applications"), false);
});
