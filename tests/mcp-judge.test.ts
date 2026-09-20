import { test, after } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

// route.ts imports its dependencies through the "@/*" tsconfig path alias,
// which only the Next/tsc bundler resolves — plain `node --experimental-strip-types`
// does not (see lib/mcp-helpers.ts's header comment, written for the exact
// same reason). This test needs route.ts's REAL verifyToken and
// requireOwnerScope (not a re-implementation), so it registers a resolve hook
// scoped to this process only, mapping "@/x" -> "<repo root>/x[.ts|/index.ts]".
const root = pathToFileURL(`${process.cwd()}/`).href;
const loaderSource = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    let target = new URL(rel + ".ts", ${JSON.stringify(root)}).href;
    if (!existsSync(fileURLToPath(target))) target = new URL(rel + "/index.ts", ${JSON.stringify(root)}).href;
    return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

process.env.MCP_SECRET = "owner-secret-abc123";
process.env.MCP_JUDGE_SECRET = "judge-secret-xyz789";

// createMcpHandler (module scope in route.ts) starts a non-unref'd cleanup
// interval the instant the module loads — harmless in the long-lived
// production runtime, but it would keep this test's process alive forever.
// process.exit() would "fix" that by lying about the run (it exits before
// node:test finishes reporting an in-flight assertion failure — proven: with
// process.exit(0) in after(), a deliberately broken assertion still printed
// "ok"/exit 0). Instead, capture the interval's handle at creation and clear
// it once the tests are done, so the process exits NATURALLY with node:test's
// real pass/fail exit code.
const capturedIntervals: ReturnType<typeof setInterval>[] = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
  const handle = realSetInterval(...args);
  capturedIntervals.push(handle);
  return handle;
}) as typeof setInterval;

const routeUrl = new URL("app/api/[transport]/route.ts", root).href;
const { verifyToken, requireOwnerScope } = (await import(routeUrl)) as {
  verifyToken: (req: Request, bearerToken?: string) => Promise<{ scopes: string[] } | undefined>;
  requireOwnerScope: (extra: { authInfo?: { scopes: string[] } }, name: string) => void;
};

globalThis.setInterval = realSetInterval;

after(() => {
  for (const handle of capturedIntervals) clearInterval(handle);
});

const fakeRequest = new Request("https://prospect.courses/api/mcp");

test("verifyToken maps the owner secret to scopes [\"scout\"]", async () => {
  const auth = await verifyToken(fakeRequest, "owner-secret-abc123");
  assert.deepEqual(auth?.scopes, ["scout"]);
});

test("verifyToken maps the judge secret to scopes [\"judge\"]", async () => {
  const auth = await verifyToken(fakeRequest, "judge-secret-xyz789");
  assert.deepEqual(auth?.scopes, ["judge"]);
});

test("verifyToken returns undefined for a wrong token", async () => {
  const auth = await verifyToken(fakeRequest, "not-a-real-secret");
  assert.equal(auth, undefined);
});

test("verifyToken returns undefined with no bearer token at all", async () => {
  const auth = await verifyToken(fakeRequest, undefined);
  assert.equal(auth, undefined);
});

test("requireOwnerScope throws FORBIDDEN_SCOPE for a judge authInfo on an owner tool", () => {
  assert.throws(
    () => requireOwnerScope({ authInfo: { scopes: ["judge"] } }, "list_roles"),
    (err: unknown) => err instanceof Error && err.message === "FORBIDDEN_SCOPE (list_roles)",
  );
});

test("requireOwnerScope throws FORBIDDEN_SCOPE when there is no authInfo at all", () => {
  assert.throws(
    () => requireOwnerScope({}, "delete_role"),
    (err: unknown) => err instanceof Error && err.message === "FORBIDDEN_SCOPE (delete_role)",
  );
});

test("requireOwnerScope passes for a scout authInfo", () => {
  assert.doesNotThrow(() => requireOwnerScope({ authInfo: { scopes: ["scout"] } }, "list_roles"));
});

// L5.6 FOLD #7: a static-scan gate, not a runtime one -- a tool whose
// requireOwnerScope call is silently dropped in a future edit fails this
// test instantly instead of surviving until a judge finds it live. Also
// pins the TOTAL tool count at 19: a silently DROPPED tool (not just a
// missing scope check) fails this too.
test("every registered MCP tool not on the owner/judge allowlist calls requireOwnerScope, and there are exactly 19 tools", () => {
  const routeSource = readFileSync(new URL("app/api/[transport]/route.ts", root), "utf8");
  const OWNER_SCOPE_ALLOWLIST = new Set(["whoami", "plan_next_steps"]);

  const toolNames = [...routeSource.matchAll(/server\.registerTool\(\s*\n\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(toolNames.length, 19, `expected 19 registered tools, found ${toolNames.length}: ${toolNames.join(", ")}`);

  for (const name of toolNames) {
    if (OWNER_SCOPE_ALLOWLIST.has(name)) continue;
    assert.match(
      routeSource,
      new RegExp(`requireOwnerScope\\(extra, "${name}"\\)`),
      `${name} is missing its requireOwnerScope(extra, "${name}") call`,
    );
  }
});
