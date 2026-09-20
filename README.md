# Prospect

**The career journey for every Virginia Tech student, all majors.** Upload a resume and a transcript, write your goal in one sentence, and get three things on one screen: a live feed of open postings ranked for you, a Human Edge label on every posting (which duties stay human-led, which are AI-assisted, which are automatable), and a semester roadmap of real VT courses and clubs.

Built at **VTHacks 14** (Virginia Tech, September 18 to 20, 2026) with Databricks as the only data backend, Gemini for the language work, and GoDaddy ANS identities on the four agents.

**Live: https://prospect.courses**

> The repo is named `scout` because the UI foundation (layout and base components) is reused from our own earlier open project of that name, with organizer permission. Everything else, the Databricks backend, the four agents, the datasets, the ranking, the roadmap and the ANS identities, was built during the hackathon, and this repository starts from a fresh history.

## Try it in three minutes

1. Open https://prospect.courses and sign in with one of the demo accounts. Each one is a blank student. Pick one nobody else at your table picked.

   | Email | Password |
   | --- | --- |
   | `a21@p.test` | `pass1234` |
   | `a22@p.test` | `pass1234` |
   | `a23@p.test` | `pass1234` |
   | `a24@p.test` | `pass1234` |
   | `a25@p.test` | `pass1234` |

2. Download the mock student's documents and upload them on the **Build profile** screen: [mock-resume.pdf](datasets/mock-profile/mock-resume.pdf) and [mock-transcript.pdf](datasets/mock-profile/mock-transcript.pdf). Pick role types, a target term, your work authorization and a dream tier.
3. Write the goal in **one short sentence, under 80 characters**. Longer goals can time out the run. Three that work well with the mock documents:
   - `Land a management consulting internship at a Big 4 firm, Summer 2027`
   - `Technology consulting internship focused on data and AI strategy`
   - `Cybersecurity consultant internship, summer 2027`
4. Watch the five named steps run (about 20 seconds on production), then land on your Journey: the ranked feed, the Human Edge labels, and the semester roadmap.

Rough edges we know about and did not have time to fix: the Home feed sends every open posting to the browser on first load, so it takes a moment; the level filter reads job titles because the scanner never fills the level column; the detail pane's correction label still says "Role" where the pill says "Field".

## How it works, in three pictures

Editable sources for each picture are next to the PNGs in [`docs/diagrams/`](docs/diagrams/). Open a `.excalidraw` file at excalidraw.com.

**1. What a student does**

![What a student does](docs/diagrams/1-what-a-student-does.png)

**2. Where the data flows**

![Where the data flows](docs/diagrams/2-where-the-data-flows.png)

**3. Four agents, each with a verifiable identity**

![Four agents with a passport](docs/diagrams/3-agents-with-a-passport.png)

## What it does

- **A live feed, ranked for you.** GitHub Actions scan about a thousand public company job boards every 30 minutes and four public internship lists every hour, so a posting reaches you while it is still open. Every role says in plain words why it fits, which requirements you meet, and which ones the posting never states. Sponsorship or citizenship language shows up as a label and never hides a role. Apply opens the employer's real page and only logs the application after you confirm. Nothing is auto-submitted.
- **Human Edge labels.** Each posting is split into duties, each duty is matched to its nearest O*NET task, and each task is labeled Human-led, AI-assisted or Automatable from the Anthropic Economic Index. Tasks the index never measured say "not measured". We do not guess a label.
- **A semester roadmap.** From this term to your target term: real VT courses and clubs from the catalog, projects marked "suggested", certifications found by grounded web search with the source linked. A course or club that is not in the catalog fails the run by name instead of shipping a made-up plan. Mark steps planned or done, add notes, re-plan later semesters.
- **Around it:** an applications tracker, light and dark themes, and an MCP endpoint so a student's or judge's own agent can search the open postings and VT courses for a goal.

The model is not allowed to decide the parts that matter. Ranking is a printed function in code (archetype fit, level fit, dream-tier fit, recency). Whether a requirement is "met" is decided in code against your profile. Gemini does the language work inside those rails: it reads the PDFs, confirms the archetype, extracts requirements and duties, plans the roadmap. Every call runs at temperature 0 with a fixed seed, a JSON schema, a timeout per step that fails by name, and job or PDF text fenced as data, never as instructions.

## How it is built

| Layer | What |
| --- | --- |
| Web app | Next.js 16 App Router, TypeScript, React server components, on Vercel |
| Database | Databricks **Lakebase** (managed Postgres 16): every application table, one `pg` pool, every per-user query scoped by `user_id` and checked by a test that fails the build if one forgets |
| Analytics store | Databricks **Delta** in Unity Catalog (`scout.core`): an hourly Job mirrors Lakebase into bronze and silver tables |
| Retrieval | Databricks **Vector Search**: posting to nearest career archetype (93 named archetypes written from real titles), duty to nearest O*NET task, goal to candidate courses and clubs |
| Jobs | Databricks Jobs, serverless: the hourly mirror and the hourly Orchestrator that re-runs Match for every profile when new postings land and logs each run to Delta |
| Genie | A Genie space over the same tables answers "why" questions; today it runs at script level, not inside the app |
| LLM | Gemini via `@google/genai`, one harness for all four agents (`lib/agents/`) |
| Agent identity | GoDaddy **ANS** (Agent Name Service): Profile, Match, Roadmap and Orchestrator each hold a DNS-anchored identity under `prospect.courses`, registered through a Registration Authority and sealed on a Transparency Log that we run ourselves from the ANS reference stack; badge, SVCB and TLSA records are live in public DNS |
| Ingestion | GitHub Actions crons in `.github/workflows/` posting to a secret-protected route |
| Auth | Supabase Auth, email and password only. It holds no tables and no files |
| Email | Resend, for the feedback box |

Every merge was gated on `tsc`, `eslint`, the test suite (1,234 tests, all passing) and a production build. Written with Claude Code and Codex.

## Real today, not built

| Real, on production | Not built (we say so on stage) |
| --- | --- |
| Lakebase as the only app database, 22 tables | Gold Delta tables |
| 30-minute ingestion: 7,500+ open postings from 900+ companies | A distilled level classifier and its MLflow holdout |
| Hourly Delta mirror; hourly Orchestrator Job (6 of its last 8 runs succeeded, the failures are logged by name) | Databricks Model Serving |
| Vector Search, four indexes online: archetypes, 18,838 O*NET tasks, 5,956 VT courses, 765 clubs | Databricks managed MCP (the app runs its own MCP server) |
| Profile, Match, Roadmap agents streaming named steps with real counts | Genie inside the app (script level only) |
| Roadmap validated against 5,956 courses and 765 clubs; invented nodes rejected | The in-app ANS gate in production: the Transparency Log runs on a laptop, so `ANS_ENFORCE` is unset on Vercel and the impostor refusal runs locally as a script through the same gate |
| Four ANS identities ACTIVE, 16 DNS records live | |
| MCP endpoint with a read-only judge bearer, proven over production | |

## For judges with their own agent

Server card: `https://prospect.courses/.well-known/mcp/server-card.json`. The bearer below is read-only (`whoami`, `plan_next_steps`); every owner tool refuses it by name with `FORBIDDEN_SCOPE`. We rotate it after judging.

```bash
curl -s https://prospect.courses/api/mcp \
  -H "Authorization: Bearer ebe35cf109705a1d2e45e5413851fa77" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"plan_next_steps","arguments":{"goal":"management consulting internship","limit":5}}}'
```

`whoami` returns the server, the domain and the four agents' ANS names. Full run of show, including the DNS lookups and the impostor refusal: [`docs/ANS-DEMO.md`](docs/ANS-DEMO.md).

## Repo map

```
app/            Next.js routes: (app) landing, setup, journey, applications, settings · (public) faq, privacy, terms, pairing · api/ watcher, profile, match, classify, scan, gate-sweep, [transport] (MCP)
components/     UI: landing, setup, roadmap, motion, brand
lib/            the logic: agents/ (Profile, Match, Roadmap harness), db.ts (Lakebase pool), catalog.ts, exposure.ts, ans-verify.ts, gate/, supabase/
db/lakebase/    the schema, numbered SQL files applied in order
databricks/     sync/ (hourly mirror notebook + job), orchestrator/, archetypes/, genie/, DEMO.md (screen-by-screen walkthrough)
ans/            agent registration script, registry.json, dns-records.json
datasets/       every dataset we load, the scripts that built them, SOURCES.md, and the mock student's PDFs
scripts/        scanners, loaders, smoke tests, demo-account tools
tests/          1,234 tests, run in-process against the same schema with pglite
docs/           ARCHITECTURE.md (the technical brief), ANS-DEMO.md, diagrams/
.github/        the ingestion crons
```

## Run it locally

```bash
npm ci
cp .env.example .env.local      # fill in Lakebase, Supabase auth, Gemini, the route secrets
node --env-file=.env.local scripts/apply-schema.mjs          # db/lakebase/*.sql, idempotent
node --env-file=.env.local scripts/load-lakebase-catalog.mjs # datasets/ -> Lakebase catalog tables
npm run dev
```

Gates: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`. Databricks setup is in [`databricks/README.md`](databricks/README.md); the ANS registry in [`ans/README.md`](ans/README.md).

## Data and credit

- [O*NET 31.0](https://www.onetcenter.org/) task statements (CC BY 4.0), 18,838 tasks.
- [Anthropic Economic Index](https://huggingface.co/datasets/Anthropic/EconomicIndex) (release 2025-03-27), task-level exposure, 2,450 tasks.
- [catalog.vt.edu](https://catalog.vt.edu/) 2026-27 academic catalog: 5,956 courses, 214 undergraduate majors, 4,830 checksheet rows. GobblerConnect public listings: 765 clubs.
- Public ATS job APIs and four public GitHub internship lists for the feed.
- Simple Icons for company marks; public-domain museum art on the landing.
- How each file was built, and what was deliberately left out: [`datasets/SOURCES.md`](datasets/SOURCES.md).
