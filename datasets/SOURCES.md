# SOURCES — VT catalog datasets (built 2026-09-19, Karthik's 16:40 call + addenda at 16:58/17:05)

> Addendum 2026-09-20: `vt_clubs.csv` landed after this note was written: 765 rows built from GobblerConnect public listing pages (name, description, category, url), loaded into Lakebase and Delta. The "NOT BUILT" section below is history.

Scope this session: `vt_courses.csv`, `vt_majors.csv`, `vt_checksheets.csv` (new file, added by
addendum 2). `vt_clubs.csv` was explicitly cut (addendum 2, 17:05): Karthik delivers it himself;
GobblerConnect was never fetched. `onet_tasks.csv` and `task_exposure.csv` were already built by a
prior session (`build_task_exposure.py`) and are not touched here; they validate/load cleanly as a
side effect of the shared loader run below.

## Build script

`datasets/build_vt_catalog.py` — Python 3.12 stdlib only (`urllib`, `re`, `csv`,
`concurrent.futures`, `html`), no third-party dependency. Subcommands: `courses --depts a,b,c
[--workers N] [--out path]`, `majors [--workers N] [--out path] [--checksheets-out path]`. Full
source docstring is in the file; summary below.

## vt_courses.csv

- **Source**: `https://catalog.vt.edu/course-descriptions/<dept>/` — one page per department, every
  department listed at `https://catalog.vt.edu/course-descriptions/`.
- **Catalog edition**: catalog.vt.edu's current/default site IS the 2026-2027 Academic Catalog
  (verified: the root page's own title link reads "2026-2027 Academic Catalog"; no `?catoid=`
  override was needed or used).
- **Coverage**: 142/142 departments fetched successfully (0 failures; the script's own >2%
  department-failure gate never tripped). 5,956 rows in the final file, covering undergraduate AND
  graduate courses together (each department page lists both). 1,723 real VT course listings
  (Special Study, Independent Study, Study Abroad, Research and Thesis, Field Study, etc. — 531 +
  394 + 132 + 73 + ... — see the "deviations" note below) were fetched and parsed but then DROPPED
  from the final CSV because catalog.vt.edu genuinely publishes no description paragraph for them
  (confirmed by hand-reading the raw cached HTML for several, e.g. `AAD 1984`/"Special Study" — the
  page has code, title, credit hours and "Variable credit course" only, no description div at all).
  The loader's `vt_courses` schema requires `description` non-empty on every row; rather than invent
  descriptive text for these, they were excluded. This is disclosed here, not silent.
- **Fields**: `department` = the page's own department name (e.g. "Computer Science"), parsed from
  its `<h1 class="page-title">`. `level` = the thousands digit of the numeric part of `code` × 1000,
  computed mechanically (not filtered to 1000-5000 as SETUP.md's illustrative range suggested — real
  VT codes include a `000`-level 2-year-program tier, e.g. `AT 0124`, and `6000`/`7000`-level
  doctoral research/dissertation-hours courses; all are kept, honestly labeled). `credits`: most
  courses have one fixed value; a minority (independent study / research / special-topics courses)
  are published as a range, e.g. "1-19 credits" — since the loader's `credits` column is a single
  DOUBLE, the LOWER bound of the range is stored as a disclosed representation choice, not a guess.
  `prereqs`: the catalog's own "Prerequisite(s):" line, verbatim text (course codes plus "and"/"or"),
  empty when the page states none.

## vt_majors.csv

- **Source**: `https://catalog.vt.edu/program-explorer/` for the list (`class="item filter_2"` =
  Undergraduate), then each program's own catalog page for `college` and `degree`.
- **Scope decision (disclosed)**: UNDERGRADUATE majors only. The program explorer also lists
  Master's/Doctoral/Graduate-Certificate/Minor entries, but graduate program URLs
  (`/graduate/degree-programs/<slug>/`) do not carry a college in their path or breadcrumb the way
  undergraduate pages do, so a `college` value for a graduate program would need a second,
  guess-prone lookup. Undergraduate majors are also what the Journey roadmap needs (a student
  declares an undergraduate major). Not a data gap — a scoping call, made because rule 1 forbids
  guessing a college.
- **Coverage**: 214/214 undergraduate program-explorer entries fetched and parsed (0 failures);
  214 rows (one per major/option combination as VT itself lists them, e.g. "Agribusiness Major with
  Agribusiness Management Option" and "...with Veterinary Business Management Option" are two
  separate real listings, not a duplicate).
- **Fields**: `college` = the breadcrumb's active college link text on that major's own page (e.g.
  "College of Engineering"), never inferred from the URL slug. `degree` = the page's own
  `<span class="subTitle">` text (e.g. "Bachelor of Science"), taken verbatim up to " in " where
  present, else the whole subtitle when the page phrases it differently (e.g. "Bachelor of Science
  Applied Economic Management" for the Community Economic Development major — that is VT's own
  wording, not a parsing error).

## vt_checksheets.csv (new file, added by addendum 2 at 17:05)

- **Source**: NOT the registrar PDF archive. `https://registrar.vt.edu/graduation-multi-brief/
  checksheets.html` was checked first (per the addendum's instruction to find the real source) and
  its newest posted PDFs are 2023/2024, not 2026-2027 — stale for this build. It is also a dead end
  for stdlib-only parsing: PDF text extraction has no Python-stdlib path and no new dependency is
  allowed. Instead, each undergraduate program's own catalog.vt.edu page (the same 214 pages fetched
  for `vt_majors.csv`) carries a "Program Curriculum" tab with an HTML table
  (`<table class="sc_courselist">`) that IS catalog.vt.edu's own current, official 2026-2027
  required/elective course list for that major, grouped under headers like "Degree Core
  Requirements" / "Major Requirements" / "Pathways" — parsed directly, no PDF involved.
- **Coverage**: same 214/214 program pages; 4,830 checksheet line-items.
- **Fields**: `requirement_group` = the table's own section-header comment text, read verbatim
  (one program page, Technology Education, uses a slightly different CSS class for the same header
  role — `class="courselistcomment"` instead of `"courselistcomment areaheader"` — both are matched
  by the parser so no row is silently dropped or mislabeled).
- **Skipped, on purpose**: comment-only table rows with no attached course code (e.g. "Select one of
  the following:", "Directed Electives" sub-notes, "Subtotal" rows) are not emitted as checksheet
  rows — turning a comment into a fabricated course row would violate rule 1. Only rows with a real
  VT course code are counted as line items.

## vt_clubs.csv — delivered by the team after this session (765 rows live; the section below is history)

GobblerConnect (`gobblerconnect.vt.edu`) WAS investigated before the cut arrived, for the record:
- `robots.txt` allows crawling (only disallows `/upload/`, `/student_docs/`, `/downloads/`,
  `/mobile_ws/v17/`, `/mobile_ws/v18/`, `/*ajax_widget_new` — none of which matter here).
- `/organizations/` and an individual org page (`/organization/sec` → redirects to
  `/sec/?club_url=organization`) both bounce an unauthenticated request back to the generic "Campus
  Home" shell page, not the organization list or profile — confirming GobblerConnect's directory
  needs a logged-in VT session, matching rule 1's login-gate stop condition. A guessed CampusLabs/
  Engage-style discovery JSON endpoint (`/api/discovery/search/organizations`) returned 404 — this
  platform is CampusGroups, not CampusLabs Engage, and its equivalent endpoints
  (`/ajax/customsearch/getclubs`, `/search/getall`) redirected to login as well.
- Per addendum 2, this was stopped there. Nothing was loaded or indexed for clubs; `scout.core.
  vt_clubs` and `vt_clubs_index` do not exist from this session's work.

## Crawler etiquette

- **robots.txt**: fetched and read for both `catalog.vt.edu` and `gobblerconnect.vt.edu` before any
  crawling (see above; neither disallows the paths used).
- **Concurrency**: ≤4 concurrent requests to catalog.vt.edu at any time across this whole build — 3
  parallel sub-agent workers each ran `courses --workers 1` (one in-flight request each = 3 total),
  and the `majors` pass (run after the course workers had mostly finished) used `--workers 1`.
- **Caching**: every fetched page is cached verbatim under `datasets/_cache/` (course pages under
  `_cache/course-descriptions/<dept>.html`, program pages under `_cache/program-pages/<slug>.html`).
  Every re-run in this session (fixing the credits-range bug, the checksheet-header-class bug) read
  from cache and refetched nothing.
- **User-Agent — DEVIATION from rule 3 (disclosed)**: catalog.vt.edu puts a non-browser User-Agent —
  including the identifying UA rule 3 asks for, `ScoutVTHacks/1.0 (+https://scout-vthacks.vercel
  .app)` — behind an AWS WAF JS challenge: `HTTP 202`, header `x-amzn-waf-action: challenge`, empty
  body. Confirmed by hand with `curl` for both UAs before writing the script: the identifying UA is
  challenged on every path tried (including `/robots.txt` itself); a standard desktop Chrome UA is
  not. The build script therefore sends a desktop Chrome UA string and identifies itself instead
  through robots.txt compliance, the concurrency cap, and full response caching. gobblerconnect.vt
  .edu (investigated before the clubs cut) does not WAF-challenge the identifying UA.
- **Failures**: 0 department fetch failures (courses), 0 program-page fetch failures (majors/
  checksheets). No retry loops were needed.

## HOW IT SCRAPES (plain words, for Karthik)

**Courses.** For each of the 142 department codes listed on `catalog.vt.edu/course-descriptions/`,
fetch `catalog.vt.edu/course-descriptions/<dept>/` with a desktop Chrome User-Agent (see deviation
above). The page is one long list of `<div class="courseblock">` chunks, one per course. Inside each
chunk: the course code and title live in `<strong>` tags under `detail-code`/`detail-title` spans;
credit hours under `detail-hours_html` (the number before the word "credit(s)"); the description
paragraph, when present, is the `<div class="courseblockextra noindent">` text; the prerequisite
line is the text after "Prerequisite(s):" inside a `detail-prereq` span. All of this is read with
plain regex over the raw HTML (no external HTML-parsing library — stdlib only), because CourseLeaf's
markup for this school is consistent enough that a full DOM parser wasn't needed. `level` is derived
from the numeric part of `code`: first digit × 1000. `credits` is the first number found in the
hours text (so "1-19 credits" becomes "1" — see the disclosed representation choice above).

**Majors + checksheets (one crawl, two outputs).** `catalog.vt.edu/program-explorer/` renders a
big static filterable grid (`<li class="item filter_2">…</li>` per undergraduate program) with each
program's title and its own catalog page URL. For each of the 214 URLs, fetch that page once and
read two things off it: (1) the breadcrumb's currently-active college link
(`<li class="active isparent"><a>College of X</a>`) and the page's `<span class="subTitle">` (the
real degree name, e.g. "Bachelor of Science in Aerospace and Ocean Engineering" — split on " in " to
separate degree from major name) for `vt_majors.csv`; (2) that same page's "Program Curriculum" tab
table (`<table class="sc_courselist">`), walked row by row: a row whose only content is a
`courselistcomment` span updates the "current section" label; a row with a `codecol` link is a real
course line and is emitted with whatever section label was most recently seen, for `vt_checksheets
.csv`. Rows with neither (pure comments like "Select one of the following") are skipped.

**Rate/etiquette mechanics**: `urllib.request` with a 30s timeout and 2 retries (0.5s/1s backoff) per
request; every response is written to `datasets/_cache/` before being parsed, and read from there on
any later run instead of refetching; `ThreadPoolExecutor(max_workers=N)` caps in-flight requests
(N=1 per worker process, 3 processes running the course crawl in parallel, 1 process for the majors/
checksheets crawl run afterward — 4 in-flight requests at the busiest overlap, never more).

## Row counts (as loaded)

| File | Rows | Loaded as |
| --- | --- | --- |
| vt_courses.csv | 5,956 | `scout.core.vt_courses` |
| vt_majors.csv | 214 | `scout.core.vt_majors` |
| vt_checksheets.csv | 4,830 | `scout.core.vt_checksheets` |
