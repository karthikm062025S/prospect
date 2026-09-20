#!/usr/bin/env node
// L5.1: register the 4 ANS identities (profile, match, roadmap, impostor)
// against the LOCAL RA/TL (build/MISSION.md L5 D19-D24). Plain ESM, Node 22
// built-ins only (fetch, child_process, fs) -- no deps, no npm install.
//
// Usage: node ans/register.mjs
// Env:   ANS_RA_URL   (default http://localhost:18080)
//        ANS_TL_URL   (default http://localhost:18081)
//        ANS_RA_KEY   (default ans-dev-key-change-me)
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
const HOSTS = {
  profile: "profile.prospect.courses",
  match: "match.prospect.courses",
  roadmap: "roadmap.prospect.courses",
  "roadmap-agent": "roadmap-agent.prospect.courses", // impostor
};

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

async function registerAgent(name, host, ansName) {
  const { identityCsrPEM, serverCsrPEM } = opensslCsrs(name, host, ansName);
  const body = {
    agentDisplayName: name.slice(0, 64),
    agentDescription: `Prospect ${name} agent (${host}), registered by ans/register.mjs.`.slice(0, 150),
    version: "1.0.0",
    agentHost: host,
    endpoints: [
      {
        agentUrl: `https://${host}/api/mcp`,
        metaDataUrl: `https://${host}/.well-known/mcp/server-card.json`,
        protocol: "MCP",
        transports: ["SSE"],
      },
    ],
    identityCsrPEM,
    serverCsrPEM,
  };
  const { json } = await ra("POST", "/v2/ans/agents", body, [202]);
  return json.agentId;
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

  const agentId = await registerAgent(name, HOSTS[name], entry.ans_name);
  await ra("POST", `/v2/ans/agents/${agentId}/verify-acme`, null, [202]);

  const detail = await ra("GET", `/v2/ans/agents/${agentId}`, null, [200]);
  appendDnsRecords(dnsRecords, name, entry.ans_name, detail.json.registrationPending?.dnsRecords ?? []);

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

  const agentId = await registerAgent("roadmap-agent", HOSTS["roadmap-agent"], entry.ans_name);
  await ra("POST", `/v2/ans/agents/${agentId}/verify-acme`, null, [202]);

  const detail = await ra("GET", `/v2/ans/agents/${agentId}`, null, [200]);
  appendDnsRecords(dnsRecords, "roadmap-agent", entry.ans_name, detail.json.registrationPending?.dnsRecords ?? []);

  entry.agent_id = agentId;
  registry.agents["roadmap-agent"] = { ans_name: entry.ans_name, agent_id: agentId };
  console.log(`registered roadmap-agent -> ${agentId} (${detail.json.agentStatus}, no verify-dns)`);
  return { name: "roadmap-agent", agentId, raStatus: detail.json.agentStatus };
}

async function main() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  let dnsRecords = loadDnsRecords();

  const results = [];
  for (const name of ["profile", "match", "roadmap"]) {
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

main();
