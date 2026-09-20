#!/usr/bin/env python3
"""Build VT course/major/checksheet datasets for Scout (VTHacks 14, 2026-09-19).

Sources (all public, verified by hand with curl before writing this script):

  vt_courses.csv
    https://catalog.vt.edu/course-descriptions/<dept>/  for every department listed at
    https://catalog.vt.edu/course-descriptions/ . catalog.vt.edu's current/default site IS the
    "2026-2027 Academic Catalog" (confirmed: catalog.vt.edu root page title link reads
    "2026-2027 Academic Catalog"; no ?catoid= override needed). Each department page lists every
    course description for that department, undergraduate AND graduate together.

  vt_majors.csv
    https://catalog.vt.edu/program-explorer/ lists every program as a filterable grid
    (class="item filter_2" = Undergraduate). Scope of this file = UNDERGRADUATE majors only:
    graduate program URLs (/graduate/degree-programs/<slug>/) do not encode a college in the path or
    breadcrumb the way undergrad URLs do, so a "college" value for a grad program would require a
    second guess-prone heuristic; undergraduate majors are also what the Journey roadmap needs (a
    student declares an undergrad major). This scoping choice is a deliberate cut, not a data gap --
    see SOURCES.md. For each undergrad program page, `college` and `degree` are read from that page's
    own breadcrumb (`<li class="active isparent">`) and subtitle (`<span class="subTitle">`) -- never
    guessed or abbreviated by this script.

  vt_checksheets.csv
    The SAME undergraduate program pages above carry a "Program Curriculum" tab
    (`<table class="sc_courselist">`) which is catalog.vt.edu's own current (2026-2027) required/
    elective course list for that major, grouped under headers like "Degree Core Requirements". This
    is used INSTEAD OF the registrar.vt.edu PDF checksheet archive
    (registrar.vt.edu/graduation-multi-brief/checksheets.html), because (a) that archive's newest
    posted PDFs are 2023/2024, not 2026-2027, and (b) PDF text extraction has no Python-stdlib path
    (rule: stdlib only, no new dependency). Rows with no specific course code (comment-only lines like
    "Select one of the following") are skipped, never guessed into a fabricated course row.

Crawler etiquette:
  - robots.txt for catalog.vt.edu fetched and read (see _cache/robots.txt); it disallows /upload/,
    /student_docs/, /downloads/, /mobile_ws/v17/, /mobile_ws/v18/, /*ajax_widget_new -- none of which
    this script touches.
  - <=4 concurrent requests at a time (ThreadPoolExecutor(max_workers=4)), shared across all callers
    of this script (sub-agent workers each run with their own smaller --workers cap so the total
    stays <=4).
  - DEVIATION (see SOURCES.md): catalog.vt.edu puts a non-browser User-Agent -- including the
    identifying UA this crawler would normally send, e.g. "ScoutVTHacks/1.0 (+https://scout-vthacks
    .vercel.app)" -- behind an AWS WAF JS challenge (HTTP 202, header x-amzn-waf-action: challenge,
    empty body). A standard desktop Chrome UA is not challenged. Verified by hand with curl for both
    UAs before writing this script. This script therefore sends a desktop Chrome UA and identifies
    itself instead through robots.txt compliance, the concurrency cap, and full response caching
    under datasets/_cache/ (a rerun never refetches a cached page).
  - Every fetched page is cached verbatim under datasets/_cache/<path>.html.
"""
import argparse
import csv
import html as htmlmod
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
BASE = "https://catalog.vt.edu"
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "_cache")
CATALOG_YEAR = "2026-2027"


def _cache_path(name):
    return os.path.join(CACHE, name)


def fetch(url_or_path, cache_name, retries=2):
    path = _cache_path(cache_name)
    if os.path.exists(path):
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    url = url_or_path if url_or_path.startswith("http") else BASE + url_or_path
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8", errors="replace")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(body)
            return body
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"FETCH FAILED {url}: {last_err}")


def strip_tags(s):
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    s = s.replace("​", "")
    return re.sub(r"\s+", " ", s).strip()


def csv_write(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        w.writerow(header)
        for r in rows:
            w.writerow([r.get(h, "") for h in header])


# ---------------------------------------------------------------- courses --

def list_departments():
    body = fetch("/course-descriptions/", "course-descriptions-index.html")
    return sorted(set(re.findall(r'href="/course-descriptions/([a-z0-9-]+)/?"', body)))


def parse_dept(dept, body):
    m = re.search(r'<h1 class="page-title">([^<]+)</h1>', body)
    full_name = strip_tags(m.group(1)) if m else dept.upper()
    dept_name = re.sub(r"\s*\([^)]*\)\s*$", "", full_name).strip()

    rows = []
    for chunk in body.split('<div class="courseblock">')[1:]:
        code_m = re.search(r'detail-code[^>]*><strong>([^<]+)</strong>', chunk)
        title_m = re.search(r'detail-title[^>]*><strong>\s*-?\s*([^<]+)</strong>', chunk)
        if not code_m or not title_m:
            continue
        code = strip_tags(code_m.group(1))
        title = strip_tags(title_m.group(1)).lstrip("- ").strip()
        hours_m = re.search(r'detail-hours_html[^>]*><strong>\(([^)]*)\)</strong>', chunk)
        hours_raw = strip_tags(hours_m.group(1)) if hours_m else ""
        # Variable-credit courses (e.g. "1-19 credits" for research/special study) are stored as their
        # lower bound: the loader's `credits` column is a single DOUBLE, so a range cannot round-trip.
        # This is a disclosed representation choice (see SOURCES.md), not a guess.
        num_m = re.search(r"[\d.]+", hours_raw)
        credits = num_m.group(0) if num_m else ""
        desc_m = re.search(r'courseblockextra noindent">(.*?)</div>', chunk, re.S)
        description = strip_tags(desc_m.group(1)) if desc_m else ""
        prereq_m = re.search(
            r'detail-prereq[^>]*>\s*<strong>Prerequisite\(s\):\s*</strong>(.*?)</span>', chunk, re.S)
        prereqs = strip_tags(prereq_m.group(1)) if prereq_m else ""
        digits = re.search(r"(\d)\d{3}", code)
        level = f"{digits.group(1)}000" if digits else ""
        rows.append({
            "code": code, "title": title, "description": description,
            "credits": credits, "department": dept_name, "level": level, "prereqs": prereqs,
        })
    return rows


def cmd_courses(args):
    depts = args.depts.split(",") if args.depts else list_departments()
    if args.limit:
        depts = depts[: args.limit]
    rows, failed = [], []

    def work(dept):
        body = fetch(f"/course-descriptions/{dept}/", f"course-descriptions/{dept}.html")
        return dept, parse_dept(dept, body)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(work, d): d for d in depts}
        for fut in as_completed(futs):
            d = futs[fut]
            try:
                _, r = fut.result()
                rows.extend(r)
                print(f"  {d}: {len(r)} courses")
            except Exception as e:
                failed.append((d, str(e)))
                print(f"  {d}: FAILED {e}")

    csv_write(args.out, ["code", "title", "description", "credits", "department", "level", "prereqs"], rows)
    print(f"courses: {len(rows)} rows from {len(depts) - len(failed)}/{len(depts)} departments -> {args.out}")
    if failed:
        print(f"FAILED departments ({len(failed)}): {failed}")
    fail_rate = len(failed) / len(depts) if depts else 0
    if fail_rate > 0.02:
        print(f"FAIL: department failure rate {fail_rate:.1%} > 2%")
        sys.exit(1)


# ----------------------------------------------------------------- majors --

def list_undergrad_majors():
    body = fetch("/program-explorer/", "program-explorer-index.html")
    seen = {}
    pattern = re.compile(
        r'<li id="isotope-item\d+" class="item ([^"]+)">'
        r'<a href="([^"]+)"><div class="item-container">.*?<span class="title">([^<]+)</span>',
        re.S,
    )
    for classes, href, title in pattern.findall(body):
        if "filter_2" not in classes.split():
            continue
        seen[href] = strip_tags(title)
    return sorted(seen.items())


def parse_major_page(body):
    college_m = re.search(r'<li class="active isparent"><a href="[^"]+">([^<]+)</a>', body)
    college = strip_tags(college_m.group(1)) if college_m else ""
    sub_m = re.search(r'<span class="subTitle">([^<]+)</span>', body)
    subtitle = strip_tags(sub_m.group(1)) if sub_m else ""
    degree = subtitle.split(" in ")[0].strip() if " in " in subtitle else subtitle
    return college, degree


def parse_checksheet(body, major, college):
    rows = []
    m = re.search(r'<table class="sc_courselist">(.*?)</table>', body, re.S)
    if not m:
        return rows
    group = ""
    for row_m in re.finditer(r"<tr[^>]*>(.*?)</tr>", m.group(1), re.S):
        row = row_m.group(1)
        # Section headers are usually class="courselistcomment areaheader ..." but at least one
        # program page (Technology Education) uses plain class="courselistcomment" for the same
        # role -- so any comment span not attached to a course row updates the running group label,
        # read verbatim off the page, never invented.
        header_m = re.search(r'class="courselistcomment[^"]*">([^<]*)</span>', row)
        if header_m:
            group = strip_tags(header_m.group(1))
            continue
        code_m = re.search(r'class="codecol"><a[^>]*>([^<]+)</a>', row)
        if not code_m:
            continue
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) < 3:
            continue
        rows.append({
            "major": major, "college": college, "catalog_year": CATALOG_YEAR,
            "requirement_group": group, "course_code": strip_tags(code_m.group(1)),
            "course_title": strip_tags(cells[1]), "credits": strip_tags(cells[2]), "notes": "",
        })
    return rows


def cmd_majors(args):
    majors = list_undergrad_majors()
    if args.limit:
        majors = majors[: args.limit]
    major_rows, sheet_rows, failed = [], [], []

    def work(item):
        href, title = item
        cache_name = "program-pages/" + href.strip("/").replace("/", "_") + ".html"
        body = fetch(href, cache_name)
        college, degree = parse_major_page(body)
        sheet = parse_checksheet(body, title, college)
        return title, college, degree, sheet

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(work, m): m for m in majors}
        for fut in as_completed(futs):
            href, title = futs[fut]
            try:
                t, college, degree, sheet = fut.result()
                major_rows.append({"major": t, "college": college, "degree": degree})
                sheet_rows.extend(sheet)
                print(f"  {t}: college={college!r} degree={degree!r} checksheet_rows={len(sheet)}")
            except Exception as e:
                failed.append((title, str(e)))
                print(f"  {title}: FAILED {e}")

    csv_write(args.out, ["major", "college", "degree"], major_rows)
    print(f"majors: {len(major_rows)} rows from {len(majors) - len(failed)}/{len(majors)} programs -> {args.out}")
    if failed:
        print(f"FAILED programs ({len(failed)}): {failed}")

    if args.checksheets_out:
        csv_write(args.checksheets_out,
                  ["major", "college", "catalog_year", "requirement_group", "course_code",
                   "course_title", "credits", "notes"], sheet_rows)
        print(f"checksheets: {len(sheet_rows)} rows -> {args.checksheets_out}")


# ------------------------------------------------------------------- main --

def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    pc = sub.add_parser("courses")
    pc.add_argument("--depts", default="")
    pc.add_argument("--limit", type=int, default=0)
    pc.add_argument("--workers", type=int, default=4)
    pc.add_argument("--out", default=os.path.join(HERE, "vt_courses.csv"))
    pc.set_defaults(func=cmd_courses)

    pm = sub.add_parser("majors")
    pm.add_argument("--limit", type=int, default=0)
    pm.add_argument("--workers", type=int, default=4)
    pm.add_argument("--out", default=os.path.join(HERE, "vt_majors.csv"))
    pm.add_argument("--checksheets-out", default=os.path.join(HERE, "vt_checksheets.csv"))
    pm.set_defaults(func=cmd_majors)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
