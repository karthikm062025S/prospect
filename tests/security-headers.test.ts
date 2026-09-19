import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../next.config.ts";

// P1-3 (fresh review 2026-09-03): SR-002 shipped `frame-ancestors 'none'` +
// `X-Frame-Options: DENY`, which also blocks the same-origin iframe QA harness
// (Karthik's Chrome is maximized at DPR 1.5, so window.resize is a no-op and
// 390 / 1440 are tested by framing the local build). SAMEORIGIN + 'self' keeps
// the identical click-jacking protection - a cross-origin attacker page still
// cannot frame the app - while letting our own origin frame it.
test("the security headers allow same-origin framing and nothing else", async () => {
  const headersFn = config.headers;
  if (typeof headersFn !== "function") throw new Error("next.config.ts no longer sets headers()");
  const groups = await headersFn();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].source, "/(.*)");

  const headers = Object.fromEntries(groups[0].headers.map((h) => [h.key, h.value]));
  assert.equal(headers["X-Frame-Options"], "SAMEORIGIN");
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'self'/);
  assert.match(headers["Content-Security-Policy"], /object-src 'none'/);
  assert.match(headers["Content-Security-Policy"], /base-uri 'self'/);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(config.poweredByHeader, false);
});
