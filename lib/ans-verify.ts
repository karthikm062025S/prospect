import registry from "../ans/registry.json" with { type: "json" };

// Server-only. The verified-agent gate (build/MISSION.md L5 D21, refined):
// startAgentRun (lib/student-profile.ts) calls assertVerifiedAgent as its
// FIRST statement, before the agent_runs insert. No LLM on this path; the
// registry is a committed, non-secret JSON map, never fetched or generated.

export type AnsRegistryEntry = { ans_name: string; agent_id: string | null };
export type AnsRegistry = {
  tl_url_default: string;
  agents: Record<string, AnsRegistryEntry>;
  impostor?: AnsRegistryEntry & { note?: string };
};

const TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60_000;

// Module-level cache: agent name -> the ms timestamp its ACTIVE verdict expires.
// ponytail: an in-memory Map is fine for a single hackathon demo process; a
// multi-instance deploy would need a shared cache (Redis/Lakebase) instead.
const verifiedUntil = new Map<string, number>();

/** Pure lookup of an agent's ANS identity, used by logging. Never throws. */
export function ansIdentityFor(agent: string): AnsRegistryEntry | null {
  const entry = (registry as AnsRegistry).agents[agent];
  return entry ? { ans_name: entry.ans_name, agent_id: entry.agent_id } : null;
}

export async function assertVerifiedAgent(
  agent: string,
  opts: { fetchImpl?: typeof fetch; now?: () => number; registry?: AnsRegistry } = {},
): Promise<void> {
  // ponytail: enforcement is OFF by default because production on Vercel
  // cannot reach a laptop-local Transparency Log. Upgrade path: a tunnel
  // (cloudflared/ngrok) to the local TL, or a hosted TL, before turning this
  // on in production.
  if (process.env.ANS_ENFORCE !== "1") return;

  const reg = opts.registry ?? (registry as AnsRegistry);
  const now = opts.now ?? Date.now;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const entry = reg.agents[agent];
  if (!entry || !entry.agent_id) {
    throw new Error(`ANS_UNVERIFIED (${agent}): not registered`);
  }

  const cachedUntil = verifiedUntil.get(agent);
  if (cachedUntil !== undefined && cachedUntil > now()) return;

  const tlUrl = process.env.ANS_TL_URL ?? reg.tl_url_default;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(`${tlUrl}/v1/agents/${entry.agent_id}`, { signal: controller.signal });
  } catch (error) {
    throw new Error(`ANS_UNVERIFIED (${agent}): transparency log unreachable (${(error as Error).message})`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    throw new Error(`ANS_UNVERIFIED (${agent}): no transparency-log record`);
  }
  if (!response.ok) {
    throw new Error(`ANS_UNVERIFIED (${agent}): transparency log unreachable (HTTP ${response.status})`);
  }

  const body = (await response.json()) as { status?: string };
  if (body.status !== "ACTIVE") {
    throw new Error(`ANS_UNVERIFIED (${agent}): status ${body.status}`);
  }

  verifiedUntil.set(agent, now() + CACHE_TTL_MS);
}
