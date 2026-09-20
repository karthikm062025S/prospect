// Live proof for the Match agent's watcher re-score-all path (brief item 6,
// L2c). Calls the DEPLOYED (or given) /api/match?all=1 endpoint with the
// shared X-Watcher-Secret bearer -- the same bearer scripts/scan.mjs sends to
// /api/watcher -- and prints whatever app/api/match/route.ts returns.
//
// Usage:
//   BASE_URL=https://scout.example.com WATCHER_SECRET=... node scripts/match-smoke.mjs
//   node scripts/match-smoke.mjs --base-url http://localhost:3000
//   node --env-file=.env.local scripts/match-smoke.mjs --user <profile user id> [--labels]
//
// Karthik runs the endpoint mode against the real deployment himself (never
// Claude, per the brief) -- it re-scores EVERY profile in Lakebase, a real
// write. The `--user` mode (speed pass, 2026-09-20) runs lib/agents/match.ts
// runMatchAgent IN-PROCESS for ONE profile against the real Lakebase, Gemini
// and Vector Search, printing each NDJSON step with its wall-clock time --
// exactly what "Rank my feed" streams, minus the HTTP hop. `--labels` then
// runs labelTopPostings (top 20, concurrency 2), which needs the Lakebase
// task_exposure table (db/lakebase/007-catalog.sql + scripts/load-lakebase-catalog.mjs).
//
// app/api/match/route.ts's watcher branch (auth.kind === "watcher") returns
// ONE JSON summary ({ profiles, rescored, nudges, errors }), not an NDJSON
// stream -- only the signed-in user path streams NDJSON
// (lib/agents/match.ts encodeStepLine). This script still checks the
// response's content-type and prints NDJSON lines as they arrive if that
// route ever changes shape, so it stays correct either way.

const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(`--${name}`);
  const v = i >= 0 ? args[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : def;
}

const BASE_URL = (opt("base-url", process.env.BASE_URL) || "").replace(/\/$/, "");
const SECRET = process.env.WATCHER_SECRET || "";
const USER_ID = opt("user", "");

if (USER_ID) {
  await runInProcess(USER_ID, args.includes("--labels"));
  process.exit(process.exitCode ?? 0);
}

if (!BASE_URL) {
  console.error("Set BASE_URL (env) or pass --base-url <url>, e.g. https://scout.example.com");
  process.exit(1);
}
if (!SECRET) {
  console.error("WATCHER_SECRET is not set");
  process.exit(1);
}

async function main() {
  const url = `${BASE_URL}/api/match?all=1`;
  console.log(`POST ${url}`);

  // route.ts sets `export const maxDuration = 300` for this route.
  const res = await fetch(url, {
    method: "POST",
    headers: { "X-Watcher-Secret": SECRET },
    signal: AbortSignal.timeout(300000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`HTTP ${res.status}: ${body}`);
    process.exit(1);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("ndjson") && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) console.log(line);
      }
    }
    if (buffer.trim()) console.log(buffer);
    return;
  }

  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
  console.log(
    `\nprofiles ${body.profiles ?? "?"} · rescored ${body.rescored ?? "?"} · nudges ${body.nudges ?? "?"} · errors ${(body.errors ?? []).length}`,
  );
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    console.log(body.errors.join("\n"));
  }
}

// lib/*.ts reach each other through EXTENSIONLESS dynamic imports (Next's
// bundler resolves them; plain node does not), so this mode registers a
// resolve hook that appends ".ts" to a relative, extensionless specifier
// coming from a lib/ file. Node 22 strips the types itself.
async function runInProcess(userId, withLabels) {
  const { register } = await import("node:module");
  register(
    `data:text/javascript,${encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (/^\\.\\.?\\//.test(specifier) && !/\\.[a-z]+$/.test(specifier) && /\\/lib\\//.test(context.parentURL ?? "")) {
          return next(specifier + ".ts", context);
        }
        return next(specifier, context);
      }
    `)}`,
    import.meta.url,
  );
  const { runMatchAgent, labelTopPostings } = await import("../lib/agents/match.ts");
  const { query, db } = await import("../lib/db.ts");

  const started = Date.now();
  let last = started;
  const stamp = () => {
    const now = Date.now();
    const line = `+${((now - last) / 1000).toFixed(1)}s (t=${((now - started) / 1000).toFixed(1)}s)`;
    last = now;
    return line;
  };
  try {
    const result = await runMatchAgent({ userId }, query, (step) => console.log(`${stamp()} ${JSON.stringify(step)}`));
    console.log(`${stamp()} done: ${JSON.stringify(result)}`);
    if (withLabels) {
      const labels = await labelTopPostings(query, userId, { limit: 20, concurrency: 2 });
      console.log(`${stamp()} labels: ${JSON.stringify(labels)}`);
    }
  } catch (error) {
    console.error(`${stamp()} match-smoke failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await db().end();
  }
}

main().catch((err) => {
  console.error("match-smoke failed:", err);
  process.exitCode = 1;
});
