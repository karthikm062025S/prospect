import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { QueryFn } from "../lib/db.ts";
import { ensureRoleJd } from "../lib/role-jd.ts";
import { GENERIC_ERROR, publicError } from "../lib/types.ts";

// P1-2 (fresh review 2026-09-03): getRoleJdAction and recaptureJdAction handed
// the panes whatever error string the layer below produced - a PostgREST
// message, a capture failure, an exception text. components/role-detail-pane
// (~242) and components/detail-pane (~512) render that string verbatim, so it
// reached the user. The real one belongs in the server log, not the UI.

test("publicError maps a raw string to one friendly line and leaves 'no error' alone", () => {
  assert.equal(publicError('column roles.season does not exist'), GENERIC_ERROR);
  assert.equal(publicError("new row violates row-level security policy for table \"roles\""), GENERIC_ERROR);
  assert.equal(publicError(null), null);
  assert.equal(publicError(undefined), null);
  assert.equal(publicError(""), null);
});

test("a throwing reader never leaks its message past the action boundary", async () => {
  const throwing: QueryFn = async () => {
    throw new Error("FetchError: connect ECONNREFUSED db.internal:5432");
  };

  const res = await ensureRoleJd(throwing, "r-1");
  assert.match(res.error ?? "", /ECONNREFUSED/); // raw, for the server log
  assert.equal(publicError(res.error), GENERIC_ERROR); // what the pane is handed
});

test("a reader that fails with a named DB error is mapped the same way", async () => {
  // The shape lib/db.ts query() throws: the table named, the driver's message kept.
  const failing: QueryFn = async () => {
    throw new Error("DB_QUERY_FAILED (roles): column roles.jd_error does not exist");
  };

  const res = await ensureRoleJd(failing, "r-1");
  assert.equal(res.error, "DB_QUERY_FAILED (roles): column roles.jd_error does not exist");
  assert.equal(publicError(res.error), GENERIC_ERROR);
});

// The mapping itself lives in two "use server" modules that a `node --test`
// process cannot import (next/cache, next/server, server-only), so the
// boundary is asserted against their source.
const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("getRoleJdAction routes every lower-layer error through publicError", () => {
  const src = source("app/role-actions.ts");
  assert.match(src, /publicError\(\(err as Error\)\.message\)/);
  assert.match(src, /error: publicError\(captured\.error\)/);
});

test("recaptureJdAction never returns the raw capture error", () => {
  const src = source("app/actions.ts");
  assert.match(src, /publicError\(captured\.error\) \?\? GENERIC_ERROR/);
  assert.ok(!src.includes('captured.error ?? "capture failed"'));
});

// P1-1: the user's explicit "Retry capture" has to reach ensureRoleJd, which is
// where the per-role ceiling that answers SR-004 is enforced.
test("getRoleJdAction forwards the user's force to the server-side ceiling", () => {
  const src = source("app/role-actions.ts");
  assert.match(src, /captureRoleJdServer\(roleId, \{ force: opts\?\.force \}\)/);
});
