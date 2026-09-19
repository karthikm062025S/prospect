# Source fixtures — real captured API responses (MISSION L2, 2026-09-19)

Every file below is an UNMODIFIED capture of a real, live response (rule 1:
"Test fixtures may ONLY be real API responses you captured live... Nothing
hand-written"). None of this data is fabricated.

| File | Source URL | Method | Captured at (UTC) | HTTP status |
| --- | --- | --- | --- | --- |
| `workday-pwc-us-experienced.raw.json` | `https://pwc.wd3.myworkdayjobs.com/wday/cxs/pwc/US_Experienced_Careers/jobs` | `POST {"appliedFacets":{},"limit":3,"offset":0,"searchText":""}` | 2026-09-19T18:41:50Z | 200 |
| `usajobs-401.raw.json` | `https://data.usajobs.gov/api/search?Keyword=software&ResultsPerPage=2` | `GET` (no `Authorization-Key` — the key is not provisioned in this environment yet, per MISSION Done Means B) | 2026-09-19T18:41:50Z | 401 |
| `adzuna-400.raw.html` | `https://api.adzuna.com/v1/api/jobs/us/search/1?results_per_page=2&what=software%20intern` | `GET` (no `app_id`/`app_key` — not provisioned yet) | 2026-09-19T18:41:50Z | 400 |

The USAJOBS/Adzuna captures are the real AUTH-GATED error responses, not
successful postings — proving the endpoint/host/path are live and reachable,
not dead, per the build brief's live-verification rule. A real 200 fixture
with real posting rows needs `USAJOBS_API_KEY`/`ADZUNA_APP_ID`+`ADZUNA_APP_KEY`
(Karthik to provision — see the build handoff's QUESTIONS).
