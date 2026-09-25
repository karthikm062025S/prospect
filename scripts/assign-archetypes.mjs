#!/usr/bin/env node
// Bulk archetype assignment for the backlog of open postings that have none:
// vector top-1 against scout.core.archetypes_index, concurrency 2, sequential chunks, looping
// until nothing is left. Survives 429s through lib/vector-search.ts's retry.
// Never runs on a user path -- the Match agent scores unassigned postings by
// title until this (or the hourly watcher top-up) reaches them.
//
//   node --env-file=.env.local scripts/assign-archetypes.mjs [--limit N]
//
// lib/agents/match.ts reaches its cross-lib values through extensionless
// dynamic imports that plain node cannot resolve, so the two real modules
// are imported here with their .ts extension (Node 22 strips types by
// default, same as scripts/load-datasets.mjs) and injected as `deps`.
import pg from "pg";
import { assignArchetypesBatch } from "../lib/agents/match.ts";
import { queryIndex } from "../lib/vector-search.ts";
import { setRoleArchetype } from "../lib/archetypes.ts";

const CHUNK = 100;
const CONCURRENCY = 2;

const args = process.argv.slice(2);
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
if (Number.isNaN(limit) || limit <= 0) {
  console.error("--limit must be a positive number");
  process.exit(1);
}

const url = process.env.LAKEBASE_URL;
if (!url) {
  console.error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 15_000 });
const q = async (text, params = [], table) => {
  try {
    return (await pool.query(text, params)).rows;
  } catch (error) {
    throw new Error(`DB_QUERY_FAILED${table ? ` (${table})` : ""}: ${error.message}`, { cause: error });
  }
};

let done = 0;
const started = Date.now();
try {
  while (done < limit) {
    const batch = Math.min(CHUNK, limit - done);
    const { assigned, remaining } = await assignArchetypesBatch(q, { limit: batch, concurrency: CONCURRENCY }, { queryIndex, setRoleArchetype });
    done += assigned;
    console.log(`assigned ${done} (+${assigned}), ${remaining} remaining, ${Math.round((Date.now() - started) / 1000)}s`);
    if (assigned === 0 || remaining === 0) break;
  }
  console.log(`DONE: ${done} postings assigned an archetype by vector`);
} finally {
  await pool.end();
}
