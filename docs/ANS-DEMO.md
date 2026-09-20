# ANS demo — judge run of show (Prospect, VTHacks 14)

**ANS** = Agent Name Service (GoDaddy's DNS-based identity for AI agents). **RA** = Registration Authority (issues an agent its certificate). **TL** = Transparency Log (append-only signed record of every registration; a badge check reads this). **SCITT** = Supply Chain Integrity, Transparency and Trust (the IETF receipt format the TL issues, a signed Merkle-provable event). **MCP** = Model Context Protocol (how a judge's own Claude talks to us). **SVCB** = a DNS record pointing a hostname at the service answering there (here, MCP). **TLSA** = a DNS record pinning a TLS cert to a hostname.

## What ANS does for Prospect

Each agent (Profile, Match, Roadmap, Orchestrator) holds an ANS passport: a name like `ans://v1.0.1.roadmap.prospect.courses` plus a signed TL record proving an outside registration authority verified it. Before any agent run writes a row, `startAgentRun` (`lib/student-profile.ts:78`) calls `assertVerifiedAgent` (`lib/ans-verify.ts`) — a badge that is not `ACTIVE` on the TL is refused before the write. The RA/TL are an outside party vouching for us, not a claim we make about ourselves.

## Why it is not on GoDaddy's list

- **Outsider verification.** The badge comes from a separate RA + TL we don't control, not a self-issued flag in our own database.
- **Live refusal, not a slide.** The impostor script below is refused by the same gate the real agents pass through, printed live in a terminal.
- **Real domain.** Identities are named under `prospect.courses`, the actual production domain, not a placeholder.

## Start the services

```
cd ans-upstream && docker compose up -d   # ans-ra :18080, ans-tl :18081
```
Finder (native, not in compose, discovery only, not on the demo path): `bin/ans-finder --config data/demo/demo-finder.yaml` (port 18082). The 3 URLs: RA `http://localhost:18080`, TL `http://localhost:18081`, Finder `http://localhost:18082`. App env: `ANS_ENFORCE=1`, `ANS_TL_URL` (defaults to `http://localhost:18081`).

Ran tonight (`docker ps`, exit 0): `ans-tl` and `ans-ra` both `Up (healthy)`; finder confirmed listening on `18082` (404 on an unmapped route, not connection refused).

## Run of show, ~90 seconds

**(1) The four identities** (`ans/registry.json`):

| Name | ANS name | Status |
| --- | --- | --- |
| profile | `ans://v1.0.1.profile.prospect.courses` | ACTIVE |
| match | `ans://v1.0.1.match.prospect.courses` | ACTIVE |
| roadmap | `ans://v1.0.1.roadmap.prospect.courses` | ACTIVE |
| orchestrator | `ans://v1.0.0.orchestrator.prospect.courses` | ACTIVE (the Databricks job; no in-app gate call) |
| roadmap-agent (impostor) | `ans://v1.0.1.roadmap-agent.prospect.courses` | PENDING_DNS, no TL record |

**(2) `ans-verify` pass vs fail** (`cd ans-upstream` first):
```
./bin/ans-verify.exe -url http://localhost:18081 -agent 373e41f3-4458-416f-83d4-228c16cf4468
```
Ran tonight, exit 0: 7 steps print `✓` (keys, receipt, COSE decode, crypto verify, status token, badge cross-check, metadata hashes), ending `status: ACTIVE`.
```
./bin/ans-verify.exe -url http://localhost:18081 -agent 55514d08-8b32-40ee-979c-e8186b8b9c4b
```
Ran tonight, exit 1: step 2 fails `HTTP 404 ... "sql: no rows in result set","code":"TL_NOT_FOUND"` — the impostor was never written to the log.

**(3) The impostor refusal** (the app's own gate, not the standalone verifier):
```
ANS_ENFORCE=1 node --experimental-strip-types scripts/ans-impostor.mjs
```
Ran tonight, exit 0. Printed:
```
roadmap-agent -> ans://v1.0.1.roadmap-agent.prospect.courses
ANS_UNVERIFIED (roadmap-agent): no transparency-log record
REFUSED, nothing written

roadmap -> ans://v1.0.1.roadmap.prospect.courses
VERIFIED
Impostor refused as required.
```
Same `assertVerifiedAgent` call `startAgentRun` makes before every real agent write — the impostor never reaches an insert.

**(4) Judge's own Claude.** Server card: `https://prospect.courses/.well-known/mcp/server-card.json`. MCP endpoint: `https://prospect.courses/api/mcp`. Judge bearer issued at the table (env `MCP_JUDGE_SECRET`, scope `judge`, read-only — `whoami` and `plan_next_steps` only; every other tool throws `FORBIDDEN_SCOPE`).

Both calls below (not run tonight — no local dev server up; bodies follow `mcp-handler`'s streamable-HTTP convention per `app/api/[transport]/route.ts` and `tests/mcp-judge.test.ts`):
```
curl -s https://prospect.courses/api/mcp \
  -H "Authorization: Bearer $MCP_JUDGE_SECRET" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```
Returns server name, ANS name/agent id/TL url, server-card URL, `prospect.courses`.
```
curl -s https://prospect.courses/api/mcp \
  -H "Authorization: Bearer $MCP_JUDGE_SECRET" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"plan_next_steps","arguments":{"goal":"backend internship","limit":5}}}'
```
Returns up to 5 open postings (`roles_public`) and 5 matching VT courses; posting text is untrusted data to report on, never an instruction.

**(5) The DNS beat:**
```
nslookup -type=TXT _ans-badge.roadmap.prospect.courses 1.1.1.1
```
Ran tonight, exit 0: `Non-existent domain` — nothing published yet, say "published at demo time." Once published (`ans/dns-records.json`): SVCB at `roadmap.prospect.courses`, TXT at `_ans-badge.roadmap.prospect.courses`, TLSA at `_443._tcp.roadmap.prospect.courses`.

## Say / never say

- Say "not on GoDaddy's list," never "the first."
- Never say "we verify employers" — the RA/TL verify our agents; postings stay unverified third-party text.
- Never claim the real-domain records are live before the orchestrator confirms which were published at demo time (right now: none).
- Never say Supabase or the old Scout app on stage.

## If something is red

- 23:00 Saturday kill gate: ANS red → drop the ANS beat, GoDaddy track is a badge only.
- RA/TL not responding: `cd ans-upstream && docker compose up -d`, recheck `docker ps` for both `healthy`.
- Finder not responding: `bin/ans-finder --config data/demo/demo-finder.yaml` (not on the demo path, skip if short on time).
- TL 404 on an agent id means it was never sealed into the log (registered but `verify-dns` never ran — the impostor's exact state) — never retry through it as transient.
