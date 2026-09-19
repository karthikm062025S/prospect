import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWatcherPayload } from "../lib/watcher-payload.ts";

test("watcher accepts a roles-only payload", () => {
  const result = parseWatcherPayload({
    roles: [{ company: "Acme", title: "Software Engineer Intern" }],
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.roles.length, 1);
});

test("watcher rejects missing or empty roles arrays", () => {
  assert.deepEqual(parseWatcherPayload({}), { ok: false, error: "payload must include at least one valid role" });
  assert.deepEqual(parseWatcherPayload({ roles: [] }), { ok: false, error: "payload must include at least one valid role" });
  assert.deepEqual(parseWatcherPayload({ drops: [{ company: "Acme", role: "Intern" }] }), {
    ok: false,
    error: "payload must include at least one valid role",
  });
  assert.deepEqual(parseWatcherPayload({ status_flips: [{ company: "Acme", watch_status: "open" }] }), {
    ok: false,
    error: "payload must include at least one valid role",
  });
});

test("watcher rejects arrays with no valid company/title pair", () => {
  assert.deepEqual(parseWatcherPayload({ roles: [null, {}, { company: "Acme" }, { title: "Intern" }] }), {
    ok: false,
    error: "payload must include at least one valid role",
  });
});
