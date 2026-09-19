// Live proof for the Match agent's watcher re-score-all path (brief item 6,
// L2c). Calls the DEPLOYED (or given) /api/match?all=1 endpoint with the
// shared X-Watcher-Secret bearer -- the same bearer scripts/scan.mjs sends to
// /api/watcher -- and prints whatever app/api/match/route.ts returns.
//
// Usage:
//   BASE_URL=https://scout.example.com WATCHER_SECRET=... node scripts/match-smoke.mjs
//   node scripts/match-smoke.mjs --base-url http://localhost:3000
//
// Karthik runs this against the real deployment himself (never Claude, per
// the brief) -- it re-scores EVERY profile in Lakebase, a real write.
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

main().catch((err) => {
  console.error("match-smoke failed:", err);
  process.exitCode = 1;
});
