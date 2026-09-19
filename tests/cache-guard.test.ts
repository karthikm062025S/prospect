import { test } from "node:test";
import assert from "node:assert/strict";
import { guardedRead } from "../lib/cache-guard.ts";

// Minimal stand-in for next/cache's unstable_cache: verified against
// node_modules/next/dist/server/web/spec-extension/unstable-cache.js that the
// real implementation only writes its cache entry after the wrapped callback
// resolves (a thrown callback never reaches that write). This fake preserves
// exactly that one contract — cache a resolved value, never cache a throw —
// without pulling in Next's server runtime, which node --test can't provide
// (unstable_cache throws "incrementalCache missing" outside a Next request).
function fakeUnstableCache<T>(read: () => Promise<T>): () => Promise<T> {
  let stored: { value: T } | undefined;
  return async () => {
    if (stored) return stored.value;
    const value = await read(); // a throw here propagates; nothing gets stored
    stored = { value };
    return value;
  };
}

test("a throwing read is not cached — the next call gets the real rows, not a stuck failure", async () => {
  let calls = 0;
  const reader = async () => {
    calls++;
    if (calls === 1) throw new Error("DB blip");
    return ["role-a", "role-b"];
  };

  const getFeed = guardedRead(fakeUnstableCache(reader), [], "test-feed");

  const first = await getFeed();
  assert.deepEqual(first, []); // fallback, since the underlying read threw
  assert.equal(calls, 1);

  const second = await getFeed();
  // If the failure had been cached, this would still be [] with calls === 1.
  assert.deepEqual(second, ["role-a", "role-b"]);
  assert.equal(calls, 2);
});

test("a factory fallback is recomputed on every failure, not reused stale", async () => {
  let fallbackCalls = 0;
  const alwaysFails = async (): Promise<{ n: number }> => {
    throw new Error("still down");
  };
  const getStats = guardedRead(alwaysFails, () => ({ n: ++fallbackCalls }), "test-stats");

  assert.deepEqual(await getStats(), { n: 1 });
  assert.deepEqual(await getStats(), { n: 2 });
});
