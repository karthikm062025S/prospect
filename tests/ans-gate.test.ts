import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { assertVerifiedAgent, type AnsRegistry } from "../lib/ans-verify.ts";
import { startAgentRun } from "../lib/student-profile.ts";

// L5.2: the verified-agent gate (build/MISSION.md L5 D21, refined). No network
// in this file -- every fetch is a scripted fake, and no LLM is anywhere on
// this path. Each scenario below uses its own agent name so the module-level
// 60 s verified-cache (lib/ans-verify.ts) never leaks a verdict from one test
// into another.

const REAL_REGISTRY: AnsRegistry = {
  tl_url_default: "http://localhost:18081",
  agents: {
    revoked: { ans_name: "ans://v1.0.0.revoked.prospect.courses", agent_id: "id-revoked" },
    notfound: { ans_name: "ans://v1.0.0.notfound.prospect.courses", agent_id: "id-notfound" },
    active: { ans_name: "ans://v1.0.0.active.prospect.courses", agent_id: "id-active" },
  },
};

function fakeFetch(respond: () => Response) {
  let calls = 0;
  const fn: typeof fetch = async () => {
    calls += 1;
    return respond();
  };
  return { fn, calls: () => calls };
}

const ORIGINAL_ENFORCE = process.env.ANS_ENFORCE;
afterEach(() => {
  if (ORIGINAL_ENFORCE === undefined) delete process.env.ANS_ENFORCE;
  else process.env.ANS_ENFORCE = ORIGINAL_ENFORCE;
});

test("unknown agent throws ANS_UNVERIFIED before any fetch", async () => {
  process.env.ANS_ENFORCE = "1";
  const { fn, calls } = fakeFetch(() => new Response(null, { status: 200 }));
  await assert.rejects(
    () => assertVerifiedAgent("nobody", { fetchImpl: fn, registry: REAL_REGISTRY }),
    /ANS_UNVERIFIED \(nobody\): not registered/,
  );
  assert.equal(calls(), 0);
});

test("a registered agent with no transparency-log record (404) throws by name", async () => {
  process.env.ANS_ENFORCE = "1";
  const { fn } = fakeFetch(() => new Response(null, { status: 404 }));
  await assert.rejects(
    () => assertVerifiedAgent("notfound", { fetchImpl: fn, registry: REAL_REGISTRY }),
    /ANS_UNVERIFIED \(notfound\): no transparency-log record/,
  );
});

test("a REVOKED badge throws with the status named", async () => {
  process.env.ANS_ENFORCE = "1";
  const { fn } = fakeFetch(() => new Response(JSON.stringify({ status: "REVOKED" }), { status: 200 }));
  await assert.rejects(
    () => assertVerifiedAgent("revoked", { fetchImpl: fn, registry: REAL_REGISTRY }),
    /ANS_UNVERIFIED \(revoked\): status REVOKED/,
  );
});

test("an ACTIVE badge resolves and is cached for 60s (second call skips the fetch)", async () => {
  process.env.ANS_ENFORCE = "1";
  const { fn, calls } = fakeFetch(() => new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200 }));
  let clock = 1_000;
  const now = () => clock;

  await assertVerifiedAgent("active", { fetchImpl: fn, registry: REAL_REGISTRY, now });
  assert.equal(calls(), 1);

  clock += 30_000; // 30s later, still inside the 60s TTL
  await assertVerifiedAgent("active", { fetchImpl: fn, registry: REAL_REGISTRY, now });
  assert.equal(calls(), 1, "cached verdict must not re-fetch within 60s");
});

test("ANS_ENFORCE unset: an unknown agent resolves without ever calling fetch", async () => {
  delete process.env.ANS_ENFORCE;
  const { fn, calls } = fakeFetch(() => new Response(null, { status: 200 }));
  await assertVerifiedAgent("nobody-at-all", { fetchImpl: fn, registry: REAL_REGISTRY });
  assert.equal(calls(), 0);
});

test("startAgentRun rejects an unverified agent BEFORE the agent_runs insert", async () => {
  process.env.ANS_ENFORCE = "1";
  let queryCalls = 0;
  const runQuery = (async () => {
    queryCalls += 1;
    return [{ id: "should-never-happen" }];
  }) as Parameters<typeof startAgentRun>[2];

  await assert.rejects(
    () => startAgentRun("totally-unregistered-agent", "user-1", runQuery),
    /ANS_UNVERIFIED \(totally-unregistered-agent\): not registered/,
  );
  assert.equal(queryCalls, 0, "the write must never run when the agent is unverified");
});
