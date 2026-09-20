# ans/ — ANS agent passport (L5.1)

Registers Prospect's three real agents (profile, match, roadmap) plus one
deliberate impostor (`roadmap-agent`) against the LOCAL ANS registry.

## 1. Start the local registry (if not already running)
```
cd ../ans-upstream && docker compose up -d   # ans-ra :18080, ans-tl :18081
```

## 2. Run the registration script (idempotent)
```
node ans/register.mjs
```
Generates keys/CSRs under `ans/keys/<name>/` (gitignored, never committed),
drives each real agent to ACTIVE (register → verify-acme → verify-dns),
writes `agent_id` into `ans/registry.json`, and appends each agent's DNS
records to `ans/dns-records.json`. The impostor registers + verify-acme's
only — it never calls verify-dns, so it has no transparency-log record.

## 3. Verify a badge offline
```
../ans-upstream/bin/ans-verify.exe -url http://localhost:18081 -agent <agentId>
```
Exit 0 for profile/match/roadmap; exit 1 (404, no TL record) for the
impostor.

## 4. Run the impostor gate demo
```
ANS_ENFORCE=1 node --experimental-strip-types scripts/ans-impostor.mjs
```
Prints `roadmap-agent` refused (`no transparency-log record`) and
`roadmap` VERIFIED.
