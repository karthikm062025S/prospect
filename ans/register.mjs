#!/usr/bin/env node
// L5.1: register the 4 ANS identities (profile, match, roadmap, impostor)
// against the LOCAL RA/TL (build/MISSION.md L5 D19-D24). Plain ESM, Node 22
// built-ins only (fetch, child_process, fs) -- no deps, no npm install.
//
// Usage: node ans/register.mjs [--reset]
// Env:   ANS_RA_URL   (default http://localhost:18080)
//        ANS_TL_URL   (default http://localhost:18081)
//        ANS_RA_KEY   (default ans-dev-key-change-me)
//
// --reset (L5.6): revokes every registry entry that still carries an
// agent_id (reason SUPERSEDED -- we are re-registering with STREAMABLE_HTTP
// transports instead of the old SSE), nulls those ids, rewrites
// dns-records.json from scratch, then runs the normal registration below
// for all five identities (profile, match, roadmap, orchestrator + the
// roadmap-agent impostor).
//
// Sequence per real agent (idempotent -- reruns skip an already-ACTIVE agent):
//   generate CSRs -> POST /v2/ans/agents (202) -> POST verify-acme (202) ->
//   GET agent (capture registrationPending.dnsRecords[]) -> POST verify-dns
//   (202) -> GET agent (confirm ACTIVE) -> GET {TL}/v1/agents/{id} (confirm
//   ACTIVE). The impostor stops after verify-acme: it is deliberately never
//   verify-dns'd, so it has no transparency-log record (build/MISSION.md L5,
//   ans-impostor.mjs demo).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // wt-l5c/
const RA_URL = process.env.ANS_RA_URL ?? "http://localhost:18080";
const TL_URL = process.env.ANS_TL_URL ?? "http://localhost:18081";
const RA_KEY = process.env.ANS_RA_KEY ?? "ans-dev-key-change-me";

const REGISTRY_PATH = path.join(ROOT, "ans", "registry.json");
const DNS_RECORDS_PATH = path.join(ROOT, "ans", "dns-records.json");
const KEYS_DIR = path.join(ROOT, "ans", "keys");

// The RA's AgentEndpoint.ValidateHostMatch (ans-upstream internal/domain/endpoint.go:147)
// requires agentUrl's hostname to equal agentHost exactly -- a fixed apex-domain
// agentUrl (https://prospect.courses/api/mcp) for every agent 422s with
// ENDPOINT_HOST_MISMATCH once agentHost varies per agent. Deviation from the
// brief's literal agentUrl/metaDataUrl values, confirmed against the live RA and
// the demo's own register.sh pattern (https://$host/mcp): both URLs use the
// per-agent host. metaDataUrl has no such check (only agentUrl is validated).
// L5.6 (fresh-review FOLD #1): "orchestrator" is a fourth real identity so
// four badges exist -- the Databricks job that re-ranks/re-plans on new
// drops is external and calls no in-app code path. Nothing in lib/ calls
// startAgentRun("orchestrator"), so the ans-verify gate is unaffected by
// this addition; it exists purely so the demo's badge count is four, not
// three.
const HOSTS = {
  profile: "profile.prospect.courses",
  match: "match.prospect.courses",
  roadmap: "roadmap.prospect.courses",
  orchestrator: "orchestrator.prospect.courses",
  "roadmap-agent": "roadmap-agent.prospect.courses", // impostor
};

const REAL_AGENTS = ["profile", "match", "roadmap", "orchestrator"];

/** POST/GET the RA. Loud failure: any status outside `expect` exits non-zero with the body printed. */
async function ra(method, urlPath, body, expect) {
  const res = await fetch(`${RA_URL}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${RA_KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (expect && !expect.includes(res.status)) {
    console.error(`FATAL: ${method} ${urlPath} -> HTTP ${res.status} (expected ${expect.join("/")})`);
    console.error(text);
    process.exit(1);
  }
  return { status: res.status, json };
}

/** GET the Transparency Log. 404 is a legitimate (non-fatal) result for a never-verified agent. */
async function tlStatus(agentId) {
  const res = await fetch(`${TL_URL}/v1/agents/${agentId}`);
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) {
    console.error(`FATAL: GET ${TL_URL}/v1/agents/${agentId} -> HTTP ${res.status} (expected 200 or 404)`);
    console.error(await res.text());
    process.exit(1);
  }
  const body = await res.json();
  return { status: res.status, body };
}

function opensslCsrs(name, host, ansName) {
  const dir = path.join(KEYS_DIR, name);
  mkdirSync(dir, { recursive: true });

  const identityCnf = `[req]\ndistinguished_name = req_dn\nreq_extensions     = v3_req\nprompt             = no\n[req_dn]\nCN = ${ansName}\n[v3_req]\nsubjectAltName = URI:${ansName}\n`;
  writeFileSync(path.join(dir, "identity.cnf"), identityCnf);
  execFileSync("openssl", ["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", path.join(dir, "identity.key")]);
  execFileSync("openssl", ["req", "-new", "-key", path.join(dir, "identity.key"), "-config", path.join(dir, "identity.cnf"), "-out", path.join(dir, "identity.csr")]);
  const identityCsrPEM = readFileSync(path.join(dir, "identity.csr"), "utf8");

  const serverCnf = `[req]\ndistinguished_name = req_dn\nreq_extensions     = v3_req\nprompt             = no\n[req_dn]\nCN = ${host}\n[v3_req]\nsubjectAltName = DNS:${host}\n`;
  writeFileSync(path.join(dir, "server.cnf"), serverCnf);
  execFileSync("openssl", ["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", path.join(dir, "server.key")]);
  execFileSync("openssl", ["req", "-new", "-key", path.join(dir, "server.key"), "-config", path.join(dir, "server.cnf"), "-out", path.join(dir, "server.csr")]);
  const serverCsrPEM = readFileSync(path.join(dir, "server.csr"), "utf8");

  return { identityCsrPEM, serverCsrPEM };
}

/** One POST /v2/ans/agents attempt for `ansName`/`version`. Returns the raw {status, json, text} -- never exits, so the caller can inspect a 409 before deciding to retry. */
async function tryRegister(name, host, ansName, version) {
  const { identityCsrPEM, serverCsrPEM } = opensslCsrs(name, host, ansName);
  const body = {
    agentDisplayName: name.slice(0, 64),
    agentDescription: `Prospect ${name} agent (${host}), registered by ans/register.mjs.`.slice(0, 150),
    version,
    agentHost: host,
    endpoints: [
      {
        agentUrl: `https://${host}/api/mcp`,
        metaDataUrl: `https://${host}/.well-known/mcp/server-card.json`,
        protocol: "MCP",
        // L5.6 FOLD #4: STREAMABLE_HTTP replaces SSE (ans-upstream
        // spec/api-spec-v2.yaml ~line 2467 Endpoint.transports enum).
        transports: ["STREAMABLE_HTTP"],
      },
    ],
    identityCsrPEM,
    serverCsrPEM,
  };
  const res = await fetch(`${RA_URL}/v2/ans/agents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, json, text };
}

/**
 * Registers `name` at `ansName` v1.0.0. If the RA rejects it as a conflict
 * (409 ANS_NAME_TAKEN -- e.g. a --reset revoke does not delete the row, so
 * the exact versioned name stays taken), reports the exact error and
 * retries once at v1.0.1, writing the bumped name back onto `entry` so the
 * registry stays in sync. Returns { agentId, ansName } (the name actually
 * accepted).
 */
async function registerAgent(name, host, ansName, entry) {
  let result = await tryRegister(name, host, ansName, "1.0.0");
  let usedAnsName = ansName;
  if (result.status === 409) {
    console.error(`RA rejected re-registration of ${ansName}: HTTP 409 -- ${result.text}`);
    usedAnsName = ansName.replace("v1.0.0.", "v1.0.1.");
    console.log(`retrying ${name} as ${usedAnsName} (version 1.0.1)`);
    result = await tryRegister(name, host, usedAnsName, "1.0.1");
    if (entry) entry.ans_name = usedAnsName;
  }
  if (result.status !== 202) {
    console.error(`FATAL: POST /v2/ans/agents (${name}) -> HTTP ${result.status} (expected 202)`);
    console.error(result.text);
    process.exit(1);
  }
  return { agentId: result.json.agentId, ansName: usedAnsName };
}

function loadDnsRecords() {
  if (existsSync(DNS_RECORDS_PATH)) return JSON.parse(readFileSync(DNS_RECORDS_PATH, "utf8"));
  return [];
}

function appendDnsRecords(records, name, ansName, dnsRecords) {
  const filtered = records.filter((r) => r.agent !== name);
  filtered.push({ agent: name, ansName, dnsRecords });
  writeFileSync(DNS_RECORDS_PATH, JSON.stringify(filtered, null, 2) + "\n");
  return filtered;
}

async function processRealAgent(name, entry, dnsRecords) {
  if (entry.agent_id) {
    const { json } = await ra("GET", `/v2/ans/agents/${entry.agent_id}`, null, [200, 404]);
    if (json && json.agentStatus === "ACTIVE") {
      console.log(`skip ${name} (ACTIVE)`);
      return { name, agentId: entry.agent_id, raStatus: json.agentStatus };
    }
  }

  const { agentId, ansName } = await registerAgent(name, HOSTS[name], entry.ans_name, entry);
  entry.ans_name = ansName;
  await ra("POST", `/v2/ans/agents/${agentId}/verify-acme`, null, [202]);

  const detail = await ra("GET", `/v2/ans/agents/${agentId}`, null, [200]);
  appendDnsRecords(dnsRecords, name, ansName, detail.json.registrationPending?.dnsRecords ?? []);

  await ra("POST", `/v2/ans/agents/${agentId}/verify-dns`, null, [202]);

  const final = await ra("GET", `/v2/ans/agents/${agentId}`, null, [200]);
  if (final.json.agentStatus !== "ACTIVE") {
    console.error(`FATAL: ${name} did not reach ACTIVE (got ${final.json.agentStatus})`);
    process.exit(1);
  }
  const tl = await tlStatus(agentId);
  if (tl.status !== 200 || tl.body?.status !== "ACTIVE") {
    console.error(`FATAL: ${name} TL record is not ACTIVE (status=${tl.status}, body=${JSON.stringify(tl.body)})`);
    process.exit(1);
  }

  entry.agent_id = agentId;
  console.log(`registered ${name} -> ${agentId} (ACTIVE)`);
  return { name, agentId, raStatus: final.json.agentStatus };
}

async function processImpostor(registry, dnsRecords) {
  const entry = registry.impostor;
  if (entry.agent_id) {
    const { json } = await ra("GET", `/v2/ans/agents/${entry.agent_id}`, null, [200, 404]);
    if (json && json.agentStatus !== "ACTIVE") {
      console.log(`skip roadmap-agent (${json.agentStatus}, never verify-dns'd)`);
      registry.agents["roadmap-agent"] = { ans_name: entry.ans_name, agent_id: entry.agent_id };
      return { name: "roadmap-agent", agentId: entry.agent_id, raStatus: json.agentStatus };
    }
  }

  const { agentId, ansName } = await registerAgent("roadmap-agent", HOSTS["roadmap-agent"], entry.ans_name, entry);
  entry.ans_name = ansName;
  await ra("POST", `/v2/ans/agents/${agentId}/verify-acme`, null, [202]);

  const detail = await ra("GET", `/v2/ans/agents/${agentId}`, null, [200]);
  appendDnsRecords(dnsRecords, "roadmap-agent", ansName, detail.json.registrationPending?.dnsRecords ?? []);

  entry.agent_id = agentId;
  registry.agents["roadmap-agent"] = { ans_name: ansName, agent_id: agentId };
  console.log(`registered roadmap-agent -> ${agentId} (${detail.json.agentStatus}, no verify-dns)`);
  return { name: "roadmap-agent", agentId, raStatus: detail.json.agentStatus };
}

/** POST /v2/ans/agents/{id}/revoke. A 404/409 (already gone/already revoked) is logged loudly and treated as a non-fatal no-op, per --reset's contract. */
async function revokeAgent(agentId) {
  const res = await fetch(`${RA_URL}/v2/ans/agents/${agentId}/revoke`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "SUPERSEDED", comments: "re-registered with STREAMABLE_HTTP" }),
  });
  if (res.status === 404 || res.status === 409) {
    console.warn(`WARN: revoke ${agentId} -> HTTP ${res.status} (ignored, continuing)`);
    return;
  }
  if (!res.ok) {
    console.error(`FATAL: POST /v2/ans/agents/${agentId}/revoke -> HTTP ${res.status}`);
    console.error(await res.text());
    process.exit(1);
  }
  console.log(`revoked ${agentId} (SUPERSEDED)`);
}

/**
 * --reset: revokes every distinct agent_id still on the registry (real
 * agents + the impostor, deduped since registry.impostor mirrors
 * registry.agents["roadmap-agent"]), nulls them all, and rewrites
 * dns-records.json to []. Mutates `registry` in place; the caller persists it.
 */
async function resetRegistry(registry) {
  const nullers = new Map(); // agentId -> [() => void, ...]
  for (const entry of Object.values(registry.agents)) {
    if (!entry.agent_id) continue;
    if (!nullers.has(entry.agent_id)) nullers.set(entry.agent_id, []);
    nullers.get(entry.agent_id).push(() => {
      entry.agent_id = null;
    });
  }
  if (registry.impostor?.agent_id) {
    const id = registry.impostor.agent_id;
    if (!nullers.has(id)) nullers.set(id, []);
    nullers.get(id).push(() => {
      registry.impostor.agent_id = null;
    });
  }
  for (const [agentId, fns] of nullers) {
    await revokeAgent(agentId);
    for (const fn of fns) fn();
  }
  writeFileSync(DNS_RECORDS_PATH, "[]\n");
  console.log("ans/dns-records.json reset to []");
}

async function main() {
  const reset = process.argv.includes("--reset");
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));

  if (reset) {
    await resetRegistry(registry);
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");
  }

  let dnsRecords = loadDnsRecords();

  const results = [];
  for (const name of REAL_AGENTS) {
    results.push(await processRealAgent(name, registry.agents[name], dnsRecords));
    dnsRecords = loadDnsRecords();
  }
  results.push(await processImpostor(registry, dnsRecords));
  dnsRecords = loadDnsRecords();

  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");

  console.log("\nname          ansName                                        agentId                               RA status    TL status");
  for (const r of results) {
    const ansName = r.name === "roadmap-agent" ? registry.impostor.ans_name : registry.agents[r.name].ans_name;
    const tl = await tlStatus(r.agentId);
    const tlLabel = tl.status === 404 ? "404 (no record)" : tl.body?.status ?? "unknown";
    console.log(
      `${r.name.padEnd(13)} ${ansName.padEnd(46)} ${r.agentId.padEnd(37)} ${String(r.raStatus).padEnd(12)} ${tlLabel}`,
    );
  }
}

main().catch((err) => {
  console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
