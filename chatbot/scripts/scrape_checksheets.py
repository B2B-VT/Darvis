"""
VT Registrar Checksheet Scraper
================================
Scrapes the official semester-by-semester "roadmap" checksheets from
registrar.vt.edu/graduation-multi-brief/checksheets.html (one PDF per
major/option, showing exactly which courses to take each year+semester) and
uploads them to the Supabase `roadmap_courses` table.

This is a different data source from scrape_curriculum.py's catalog.vt.edu
scrape: catalog.vt.edu's "Plan of Study Grid" loses year granularity when
scraped (year-header rows get overwritten by the following semester-header
row before any course is tagged with it — confirmed against live data,
2026-08-06). These registrar checksheet PDFs are the actual source VT uses
for advising and preserve year+semester per course.

Usage:
    pip install requests beautifulsoup4 lxml pdfplumber supabase
    export SUPABASE_URL=https://rpmgcurhxrgtzbdixtay.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=<your service role key>
    python scrape_checksheets.py [--limit N] [--dry-run]

    --limit N    only scrape the first N majors (for testing)
    --dry-run    scrape and print, don't upload to Supabase
"""

import argparse
import io
import os
import re
import time

import pdfplumber
import requests
from bs4 import BeautifulSoup
from supabase import Client, create_client

BASE = "https://www.registrar.vt.edu"
INDEX_URL = f"{BASE}/graduation-multi-brief/checksheets.html"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VT-checksheet-scraper/1.0)"}
SLEEP_BETWEEN = 0.4  # seconds between PDF downloads — be polite

_YEAR_RE = re.compile(r"\b(20\d{2})\b")
_COURSE_CODE_RE = re.compile(r"^([A-Z]{2,4})\s*(\d{4})")
_YEAR_NUM_WORDS = {
    "first": 1, "1st": 1, "second": 2, "2nd": 2,
    "third": 3, "3rd": 3, "fourth": 4, "4th": 4, "fifth": 5, "5th": 5,
}


# ── Index page: find each major's latest-catalog-year checksheet PDF ───────────

def _cell_grid(table) -> list[list[dict]]:
    """
    Parse an HTML <table> into a grid of {"text", "links"} dicts, correctly
    forward-filling rowspan'd cells (BeautifulSoup does not do this itself —
    a row "continuing" a rowspan'd major-name cell has no <td> for it at all).
    """
    grid: list[list[dict]] = []
    pending: dict[int, tuple[int, dict]] = {}
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if not cells:
            continue
        row: list[dict] = []
        col = 0
        cell_iter = iter(cells)
        next_cell = next(cell_iter, None)
        while next_cell is not None or col in pending:
            if col in pending:
                remaining, data = pending[col]
                row.append(data)
                pending[col] = (remaining - 1, data) if remaining - 1 > 0 else None
                if pending[col] is None:
                    del pending[col]
                col += 1
                continue
            text = next_cell.get_text(" ", strip=True)
            links = [
                (a.get_text(strip=True), a["href"])
                for a in next_cell.find_all("a", href=True)
                if a["href"].lower().endswith(".pdf")
            ]
            data = {"text": text, "links": links}
            rowspan = int(next_cell.get("rowspan", 1) or 1)
            if rowspan > 1:
                pending[col] = (rowspan - 1, data)
            row.append(data)
            col += 1
            next_cell = next(cell_iter, None)
        grid.append(row)
    return grid


def find_latest_checksheets() -> list[dict]:
    """Returns [{"major_name": ..., "option": ..., "year_label": ..., "pdf_url": ...}, ...],
    one entry per major/option row, using only the most recent catalog year available."""
    r = requests.get(INDEX_URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    results = []
    for table in soup.find_all("table"):
        header_text = table.get_text(" ", strip=True)[:80].lower()
        if "major" not in header_text and "minor" not in header_text:
            continue
        is_minor_table = "minor" in header_text and "major" not in header_text
        if is_minor_table:
            continue  # only degree majors matter for schedule building

        grid = _cell_grid(table)
        if not grid:
            continue
        for row in grid[1:]:  # skip header row
            if len(row) < 3:
                continue
            major_name = row[0]["text"]
            option = row[1]["text"] if len(row) > 1 else ""
            if not major_name or major_name.lower().startswith("major"):
                continue

            best_year_num = -1
            best_link = None
            best_year_label = None
            for cell in row[2:]:
                for label, href in cell["links"]:
                    years = [int(y) for y in _YEAR_RE.findall(label)]
                    if not years:
                        continue
                    y = max(years)
                    if y > best_year_num:
                        best_year_num = y
                        best_link = href
                        best_year_label = label
            if best_link:
                results.append({
                    "major_name": major_name,
                    "option": option,
                    "year_label": best_year_label,
                    "pdf_url": best_link if best_link.startswith("http") else BASE + best_link,
                })
    return results


# ── PDF parsing ──────────────────────────────────────────────────────────────

def _parse_cell(cell_text: str) -> dict | None:
    """Extract (course_code, credits handled separately, title) from a
    checksheet cell like 'CHEM1035(1)GeneralChemistryPre:Eligibletoenroll'.
    Returns None for non-course rows (blank, section labels)."""
    cell_text = (cell_text or "").strip()
    if not cell_text:
        return None
    m = _COURSE_CODE_RE.match(cell_text)
    if not m:
        # Elective/Pathways placeholder — no fixed course code, still worth
        # recording so schedule_builder knows a slot exists even if it can't
        # auto-resolve a specific course for it.
        return {"course_code": None, "course_title": cell_text[:200]}
    subject, number = m.group(1), m.group(2)
    rest = cell_text[m.end():]
    rest = re.sub(r"^\(\d+\)", "", rest)  # drop the "(1)" footnote marker
    title = re.split(r"Pre:|Co:", rest)[0].strip()
    return {"course_code": f"{subject} {number}", "course_title": title[:200] or None}


_BARE_CREDIT_RE = re.compile(r"^\d+(?:[a-zA-Z](?:,[a-zA-Z])*)?(?:\[[^\]]*\])?$")


def parse_checksheet_pdf(pdf_bytes: bytes) -> list[dict]:
    """Returns a list of {year_number, semester, course_code, course_title,
    credits, sort_order} dicts.

    Different colleges use different checksheet table layouts (confirmed:
    Engineering puts "Year" and "Semester" in one combined header row with a
    fixed 6-column layout; Business puts "YEAR ONE" on its own row separate
    from the "FALL SEMESTER"/"SPRING SEMESTER" header, with a 9-column
    layout and marker-letter columns in between). Column positions are
    therefore detected per-table from the header row's actual cell indices,
    not hardcoded — this generalizes across the layouts observed so far.
    Layouts not seen during development may still not parse; coverage is
    reported by the caller, not assumed to be 100%.
    """
    rows_out: list[dict] = []
    sort_order = 0
    current_year_number = None
    fall_col = spring_col = None

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                if not table:
                    continue
                for row in table:
                    row_texts = [(c or "").replace("\n", " ").strip() for c in row]
                    if not any(row_texts):
                        continue
                    joined = " ".join(row_texts).upper()

                    year_word_match = None
                    for word, num in _YEAR_NUM_WORDS.items():
                        if re.search(rf"\b{re.escape(word.upper())}\b", joined):
                            year_word_match = num
                            break
                    has_fall = "FALL" in joined
                    has_spring = "SPRING" in joined

                    # Year-only row ("YEAR ONE") — update year, keep scanning
                    # (this row alone isn't also the Fall/Spring header).
                    if year_word_match and "YEAR" in joined and not has_fall and not has_spring:
                        current_year_number = year_word_match
                        continue

                    # Fall/Spring header row — locate real column indices for
                    # this table, and pick up a same-row year word if present
                    # (the combined-header layout).
                    if has_fall and has_spring:
                        if year_word_match:
                            current_year_number = year_word_match
                        fall_col = next((i for i, t in enumerate(row_texts) if "FALL" in t.upper()), None)
                        spring_col = next((i for i, t in enumerate(row_texts) if "SPRING" in t.upper()), None)
                        continue

                    if joined.startswith("TOTAL") or not current_year_number or fall_col is None:
                        continue

                    for semester, col in (("Fall", fall_col), ("Spring", spring_col)):
                        if col is None or col >= len(row_texts):
                            continue
                        parsed = _parse_cell(row_texts[col])
                        if not parsed:
                            continue
                        credits = None
                        for j in range(col + 1, min(col + 4, len(row_texts))):
                            candidate = row_texts[j]
                            if candidate and _BARE_CREDIT_RE.match(candidate):
                                credits = int(re.match(r"\d+", candidate).group())
                                break
                        rows_out.append({
                            "year_number": current_year_number,
                            "semester": semester,
                            "course_code": parsed["course_code"],
                            "course_title": parsed["course_title"],
                            "credits": credits,
                            "sort_order": sort_order,
                        })
                        sort_order += 1
    return rows_out


# ── Upload ───────────────────────────────────────────────────────────────────

def upload(supabase: Client, major_name: str, catalog_year: str, rows: list[dict]):
    supabase.table("roadmap_courses").delete().eq("major_name", major_name).eq(
        "catalog_year", catalog_year
    ).execute()
    payload = [
        {
            "major_name": major_name,
            "catalog_year": catalog_year,
            "year_number": r["year_number"],
            "semester": r["semester"],
            "course_code": r["course_code"],
            "course_title": r["course_title"],
            "credits": r["credits"],
            "sort_order": r["sort_order"],
        }
        for r in rows
    ]
    for i in range(0, len(payload), 200):
        supabase.table("roadmap_courses").insert(payload[i:i + 200]).execute()


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    supabase = None
    if not args.dry_run:
        supabase_url = os.environ.get("SUPABASE_URL", "https://rpmgcurhxrgtzbdixtay.supabase.co")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not supabase_key:
            print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set.")
            return
        supabase = create_client(supabase_url, supabase_key)

    print("Fetching checksheet index...")
    entries = find_latest_checksheets()
    print(f"Found {len(entries)} major/option checksheet entries.")
    if args.limit:
        entries = entries[:args.limit]

    seen_urls: set[str] = set()
    for i, entry in enumerate(entries):
        pdf_url = entry["pdf_url"]
        if pdf_url in seen_urls:
            continue
        seen_urls.add(pdf_url)

        major_display = entry["major_name"]
        if entry["option"] and "no option" not in entry["option"].lower():
            major_display = f"{major_display} — {entry['option']}"

        print(f"[{i + 1}/{len(entries)}] {major_display} ({entry['year_label']})")
        try:
            resp = requests.get(pdf_url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            rows = parse_checksheet_pdf(resp.content)
        except Exception as exc:
            print(f"  FAILED: {exc}")
            continue

        if not rows:
            print("  (no course rows parsed — skipping)")
            continue
        print(f"  parsed {len(rows)} course rows")

        if supabase is not None:
            upload(supabase, major_display, entry["year_label"], rows)

        time.sleep(SLEEP_BETWEEN)

    print("\nDone.")


if __name__ == "__main__":
    main()
