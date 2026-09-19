// The fast lane's notify layer (RB-082 v2, slice 6c-finish): @mention Karthik on
// the per-day GitHub issue for roles this run genuinely INSERTED. Title + body
// replicate .github/workflows/scan.yml's "notify on new drops" step byte for
// byte (same @mention, same line format, same footer, same New York day), so a
// fast-lane run and an Actions run share one issue per day: comment if it is
// open, create it otherwise. scan.yml itself stays untouched (MISSION D4).
//
// Pure builders + one injectable poster (no imports from lib/, D6);
// tests/scan-route.test.ts locks the format against the workflow's one-liner.

// G1 L3: the repo + handle are deployment config, not source. `SCOUT_ISSUE_REPO`
// ("owner/repo") is read by the ONE impure caller (app/api/scan/route.ts) and
// passed in; unset = notify skipped, exactly like a missing PAT. The builders
// below stay pure so the node:test runner can call them (D6).
export const ISSUE_FOOTER_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";

/** "owner/repo" -> "@owner"; the @mention the daily issue opens with. */
export function issueMention(repo: string): string {
  return `@${repo.split("/", 1)[0]}`;
}

export type NotifyRole = {
  company: string;
  title: string;
  role_type: string | null;
  posted_at: string | null;
  link: string | null;
};

// scan.yml: `day=$(TZ=America/New_York date +%F)` — en-CA formats as YYYY-MM-DD.
const NY_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function issueDay(now: Date): string {
  return NY_DAY.format(now);
}

export function buildIssueTitle(dayIso: string): string {
  return `Scout: new drops — ${dayIso}`;
}

// scan.yml: '- **'+r.company+'** — '+r.title+' ['+r.role_type+'] '+(r.posted_at||'')+(r.link?' — '+r.link:'')
export function buildIssueBody(inserted: NotifyRole[], repo: string): string {
  const lines = inserted
    .map((r) => `- **${r.company}** — ${r.title} [${r.role_type}] ${r.posted_at || ""}${r.link ? ` — ${r.link}` : ""}`)
    .join("\n");
  return `${issueMention(repo)} — ${inserted.length} fresh role(s) found:\n\n${lines}\n\n→ ${ISSUE_FOOTER_URL}`;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type NotifyResult = { action: "commented" | "created" | "skipped"; number: number | null };

// Lists open issues (the Issues API also returns PRs — skipped), comments on the
// first whose title is today's, else creates it. Throws on any non-2xx so the
// caller can log; never called with an empty list in anger (returns skipped).
export async function postDailyIssue(opts: {
  fetch: FetchFn;
  token: string;
  repo: string;
  inserted: NotifyRole[];
  now?: Date;
}): Promise<NotifyResult> {
  if (opts.inserted.length === 0) return { action: "skipped", number: null };
  const title = buildIssueTitle(issueDay(opts.now ?? new Date()));
  const body = buildIssueBody(opts.inserted, opts.repo);
  const base = `https://api.github.com/repos/${opts.repo}`;
  const headers = {
    authorization: `Bearer ${opts.token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "scout-vthacks",
    "content-type": "application/json",
  };
  const call = async (path: string, init?: RequestInit) => {
    const res = await opts.fetch(`${base}${path}`, { ...init, headers });
    if (!res.ok) throw new Error(`GitHub ${init?.method ?? "GET"} ${path} → ${res.status}`);
    return res.json();
  };

  const open = (await call("/issues?state=open&per_page=100")) as Array<{ number: number; title: string; pull_request?: unknown }>;
  const existing = open.find((i) => !i.pull_request && i.title === title);
  if (existing) {
    await call(`/issues/${existing.number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
    return { action: "commented", number: existing.number };
  }
  const created = (await call("/issues", { method: "POST", body: JSON.stringify({ title, body }) })) as { number: number };
  return { action: "created", number: created.number };
}
