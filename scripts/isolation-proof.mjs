#!/usr/bin/env node
// V1/V2 (OD1) transport-level isolation proof, run against the LIVE project.
//
// Creates a throwaway auth user with the service key, signs it in to mint a
// real user JWT, then talks to PostgREST with the ANON key + that JWT (exactly
// what a signed-in browser session is) and asserts:
//   - every per-user table returns 0 rows (RLS scopes to auth.uid())
//   - the shared feed views return rows (authenticated users share the feed)
//   - a write to the shared feed is denied (service role only)
// The user is deleted at the end, pass or fail.
//
// Run:  node --env-file=<path to .env.local> scripts/isolation-proof.mjs
// Never prints a key or a token.

// `node --env-file` keeps a UTF-8 BOM in the FIRST key's name, so a
// BOM-prefixed .env.local silently hides one variable. Strip it once.
const env = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k.replace(/^﻿/, ""), v]),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error(
    "missing env: need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(2);
}

const PRIVATE_TABLES = ["user_roles", "applications", "outreach", "application_events", "feedback"];
const PUBLIC_VIEWS = ["roles_public", "companies_public"];

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, { key, jwt, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${jwt ?? key}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

const email = `scout-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
const password = `Pw-${crypto.randomUUID()}`;
let userId = null;

try {
  // 1. create the throwaway user (service key, admin API)
  const created = await api("/auth/v1/admin/users", {
    key: service,
    method: "POST",
    body: { email, password, email_confirm: true },
  });
  if (created.status >= 300 || !created.json?.id) {
    record("create throwaway user", false, `HTTP ${created.status}`);
    process.exit(1);
  }
  userId = created.json.id;
  record("create throwaway user", true, `uid ${userId.slice(0, 8)}…`);

  // 2. mint its JWT with the anon key (a real browser sign-in)
  const signedIn = await api("/auth/v1/token?grant_type=password", {
    key: anon,
    method: "POST",
    body: { email, password },
  });
  const jwt = signedIn.json?.access_token;
  if (!jwt) {
    record("sign in throwaway user", false, `HTTP ${signedIn.status}`);
    process.exit(1);
  }
  const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
  record(
    "sign in throwaway user",
    claims.sub === userId && claims.role === "authenticated",
    `role=${claims.role} exp-iat=${claims.exp - claims.iat}s`,
  );

  // 3. every per-user table must be empty for this user
  for (const table of PRIVATE_TABLES) {
    const r = await api(`/rest/v1/${table}?select=*&limit=5`, { key: anon, jwt });
    const rows = Array.isArray(r.json) ? r.json.length : null;
    record(
      `select ${table} → 0 rows`,
      r.status === 200 && rows === 0,
      `HTTP ${r.status} rows=${rows ?? "n/a"}`,
    );
  }

  // 4. the shared feed must be visible
  for (const view of PUBLIC_VIEWS) {
    const r = await api(`/rest/v1/${view}?select=id&limit=5`, { key: anon, jwt });
    const rows = Array.isArray(r.json) ? r.json.length : null;
    record(`select ${view} → >0 rows`, r.status === 200 && rows > 0, `HTTP ${r.status} rows=${rows ?? "n/a"}`);
  }

  // 5. base feed tables stay deny-all, and a write is denied
  for (const table of ["roles", "companies"]) {
    const r = await api(`/rest/v1/${table}?select=id&limit=1`, { key: anon, jwt });
    const rows = Array.isArray(r.json) ? r.json.length : null;
    record(`select ${table} (base table) → 0 rows`, r.status === 200 && rows === 0, `HTTP ${r.status} rows=${rows ?? "n/a"}`);
  }
  const insert = await api("/rest/v1/roles", {
    key: anon,
    jwt,
    method: "POST",
    body: { title: "isolation-proof should never land", company_id: null },
    headers: { Prefer: "return=representation" },
  });
  record(
    "insert into roles → denied",
    insert.status >= 400,
    `HTTP ${insert.status} code=${insert.json?.code ?? "n/a"}`,
  );

  // 6. a write into another user's private table is impossible too:
  //    inserting a feedback row with a foreign user_id must be rejected.
  const foreign = await api("/rest/v1/feedback", {
    key: anon,
    jwt,
    method: "POST",
    body: {
      user_id: "00000000-0000-0000-0000-000000000001",
      page: "/isolation-proof",
      message: "isolation-proof should never land",
    },
  });
  record(
    "insert feedback as another user → denied",
    foreign.status >= 400,
    `HTTP ${foreign.status} code=${foreign.json?.code ?? "n/a"}`,
  );
} finally {
  if (userId) {
    const del = await api(`/auth/v1/admin/users/${userId}`, { key: service, method: "DELETE" });
    record("delete throwaway user", del.status < 300, `HTTP ${del.status}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
