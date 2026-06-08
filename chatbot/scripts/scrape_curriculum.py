"""
VT Catalog Curriculum Scraper
==============================
Scrapes graduation requirements for all undergrad majors from catalog.vt.edu
and uploads them to the Supabase `majors` + `major_requirements` tables.

Usage:
    pip install requests beautifulsoup4 supabase
    export SUPABASE_URL=https://rpmgcurhxrgtzbdixtay.supabase.co
    export SUPABASE_SERVICE_ROLE_KEY=<your service role key>
    python scrape_curriculum.py

Get the service role key from:
  Supabase Dashboard → Project Settings → API → service_role (secret)
"""

import json
import os
import re
import time
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────

BASE = "https://catalog.vt.edu"

COLLEGE_URLS = [
    ("College of Agriculture & Life Sciences",
     f"{BASE}/undergraduate/agriculture-life-sciences/"),
    ("College of Architecture, Arts, and Design",
     f"{BASE}/undergraduate/architecture-arts-design/"),
    ("College of Engineering",
     f"{BASE}/undergraduate/college-engineering/"),
    ("College of Science",
     f"{BASE}/undergraduate/college-science/"),
    ("College of Liberal Arts and Human Sciences",
     f"{BASE}/undergraduate/liberal-arts-human-sciences/"),
    ("College of Natural Resources and Environment",
     f"{BASE}/undergraduate/natural-resources-environment/"),
    ("Pamplin College of Business",
     f"{BASE}/undergraduate/pamplin-college-business/"),
    ("Veterinary Medicine",
     f"{BASE}/undergraduate/veterinary-medicine/"),
]

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VT-catalog-scraper/1.0)"}
SLEEP_BETWEEN = 0.5   # seconds between requests — be polite


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def fetch(url: str, retries: int = 3) -> BeautifulSoup | None:
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            if r.status_code == 200:
                return BeautifulSoup(r.text, "html.parser")
            print(f"  HTTP {r.status_code}: {url}")
            return None
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"  FAILED after {retries} attempts: {url} — {e}")
                return None
    return None


# ── URL discovery ─────────────────────────────────────────────────────────────

_DEGREE_SLUGS = ("-bs", "-ba", "-bfa", "-barch", "-bla", "-bmus", "-bsw", "-bpa")

def is_major_url(href: str) -> bool:
    if "/undergraduate/" not in href:
        return False
    if href.endswith(".pdf") or "#" in href or "/search/" in href:
        return False
    # Must end with a degree-type slug (possibly with option appended)
    last = href.rstrip("/").split("/")[-1]
    return any(slug in last for slug in _DEGREE_SLUGS)


def find_major_urls(college_url: str) -> list[str]:
    soup = fetch(college_url)
    if not soup:
        return []
    urls = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.startswith("http"):
            href = BASE + href
        # Normalize trailing slash
        href = href.rstrip("/") + "/"
        if is_major_url(href):
            urls.add(href)
    return sorted(urls)


# ── Page parsers ──────────────────────────────────────────────────────────────

def extract_degree(soup: BeautifulSoup, page_url: str) -> str:
    # Breadcrumb subtitle (e.g., "Bachelor of Science in Computer Science")
    for tag in soup.find_all(["p", "div", "span"]):
        text = tag.get_text(strip=True)
        for deg in ["Bachelor of Science", "Bachelor of Arts", "Bachelor of Fine Arts",
                    "Bachelor of Architecture", "Bachelor of Landscape Architecture",
                    "Bachelor of Music", "Bachelor of Social Work"]:
            if deg in text and len(text) < 120:
                # Map to abbreviation
                mapping = {
                    "Bachelor of Science": "B.S.",
                    "Bachelor of Arts": "B.A.",
                    "Bachelor of Fine Arts": "B.F.A.",
                    "Bachelor of Architecture": "B.Arch.",
                    "Bachelor of Landscape Architecture": "B.L.A.",
                    "Bachelor of Music": "B.Mus.",
                    "Bachelor of Social Work": "B.S.W.",
                }
                return mapping[deg]
    # Fallback: guess from URL slug
    slug = page_url.rstrip("/").split("/")[-1]
    if "-ba-" in slug or slug.endswith("-ba"):
        return "B.A."
    if "-bfa" in slug:
        return "B.F.A."
    if "-barch" in slug:
        return "B.Arch."
    return "B.S."


def extract_total_credits(soup: BeautifulSoup) -> int | None:
    for td in soup.find_all("td"):
        text = td.get_text(strip=True).lower()
        if "total credits" in text or (text == "total" and "credits" in text):
            # Next sibling cell has the number
            sibling = td.find_next_sibling("td")
            if sibling:
                m = re.search(r"\d+", sibling.get_text())
                if m:
                    return int(m.group())
    # Also try tfoot rows
    for tfoot in soup.find_all("tfoot"):
        m = re.search(r"\b(\d{3})\b", tfoot.get_text())
        if m:
            return int(m.group(1))
    return None


def _is_group_header_row(cells: list) -> str | None:
    """
    Returns the group header text if this row is a section header, else None.
    The catalog uses 3-cell rows where cells[1:] are empty for group headers
    (e.g. "Degree Core Requirements | | ").
    Also handles single-cell colspan rows.
    """
    if len(cells) == 1:
        text = cells[0].get_text(" ", strip=True)
        if text and len(text) < 150 and not re.match(r"^[A-Z]{2,6}\s+\d{4}", text):
            return text
    if len(cells) >= 2:
        first = cells[0].get_text(" ", strip=True)
        rest_empty = all(c.get_text(strip=True) == "" for c in cells[1:])
        if rest_empty and first and len(first) < 150:
            if not re.match(r"^[A-Z]{2,6}\s+\d{4}", first):
                return first
    return None


def _clean_code(raw: str) -> str:
    """
    Extract just the first course code from a cell that may contain
    'BIOL 1105 & BIOL 1115' or 'or CMDA 2005' etc.
    """
    raw = re.sub(r"\s+", " ", raw).strip()
    # Remove 1-2 digit footnote superscripts at the end (e.g. "CS 4944 1")
    # Use \s+ (not \s*) so we never strip digits that are part of a course number
    raw = re.sub(r"\s+\d{1,2}$", "", raw).strip()
    # If cell contains " or ", " & ", take only the first course code
    for sep in [" or ", " & ", " and "]:
        if sep in raw:
            raw = raw.split(sep)[0].strip()
    return raw


def parse_curriculum_table(soup: BeautifulSoup) -> list[dict]:
    """
    Parse required courses from the page. Uses two strategies in order:

    1. Roadmap table ("Plan of Study Grid") — cleanest source, one course per row,
       no ambiguity about what's required vs. elective.
    2. Program Curriculum table — used to capture elective options as well.
    """
    requirements = []
    sort_order = 0

    # ── Strategy 1: Roadmap table ──────────────────────────────────────────────
    roadmap_table = None
    for heading in soup.find_all(["h2", "h3"]):
        if "roadmap" in heading.get_text(strip=True).lower():
            roadmap_table = heading.find_next("table")
            break
    # Fallback: look for a table with "Plan of Study" caption
    if not roadmap_table:
        for table in soup.find_all("table"):
            cap = table.find("caption")
            if cap and "plan of study" in cap.get_text(strip=True).lower():
                roadmap_table = table
                break

    skip_terms = {
        "credits", "total", "subtotal", "first year", "second year",
        "third year", "fourth year", "fifth year", "fall semester",
        "spring semester", "summer semester",
    }

    if roadmap_table:
        current_group = "Roadmap"
        for row in roadmap_table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            first_text = cells[0].get_text(" ", strip=True).lower()

            # Year / semester label rows — update group, don't add as courses
            if any(t in first_text for t in ("year", "semester")):
                current_group = cells[0].get_text(" ", strip=True)
                continue
            # Skip credit-total rows
            if any(t in first_text for t in skip_terms):
                continue

            code_raw  = cells[0].get_text(" ", strip=True) if cells else ""
            title_raw = cells[1].get_text(" ", strip=True) if len(cells) > 1 else ""
            cred_raw  = cells[-1].get_text(strip=True) if len(cells) > 2 else ""

            code_clean = _clean_code(code_raw)
            is_course  = bool(re.match(r"^[A-Z]{2,6}\s+\d{4}", code_clean))

            credits_min = credits_max = None
            cm = re.search(r"(\d+)(?:\s*[-–]\s*(\d+))?", cred_raw)
            if cm:
                credits_min = int(cm.group(1))
                credits_max = int(cm.group(2)) if cm.group(2) else credits_min

            req_type = "required" if is_course else "elective_placeholder"
            requirements.append({
                "course_code":       code_clean if is_course else None,
                "course_title":      title_raw or None,
                "credits_min":       credits_min,
                "credits_max":       credits_max,
                "requirement_type":  req_type,
                "requirement_group": current_group,
                "sort_order":        sort_order,
            })
            sort_order += 1

    # ── Strategy 2: Curriculum + elective tables (for elective options) ────────
    seen_codes = {r["course_code"] for r in requirements if r["course_code"]}
    current_group = "General Requirements"

    for table in soup.find_all("table"):
        headers_text = " ".join(
            th.get_text(strip=True).lower() for th in table.find_all("th")
        )
        # Skip tables without Code/Credits columns (e.g. roadmap already parsed)
        if not any(kw in headers_text for kw in ("code", "credits")):
            continue
        # Skip the roadmap table (already parsed)
        if roadmap_table and table is roadmap_table:
            continue

        for row in table.find_all("tr"):
            if row.find("th"):
                continue
            cells = row.find_all("td")
            if not cells:
                continue

            # Detect group header rows
            group_text = _is_group_header_row(cells)
            if group_text:
                current_group = group_text
                continue

            if len(cells) < 2:
                continue

            code_raw  = cells[0].get_text(" ", strip=True)
            title_raw = cells[1].get_text(" ", strip=True)
            cred_raw  = cells[-1].get_text(strip=True) if len(cells) > 2 else ""

            skip_words = ("subtotal", "total credits", "total")
            if any(w in code_raw.lower() for w in skip_words):
                continue

            code_clean = _clean_code(code_raw)
            is_course  = bool(re.match(r"^[A-Z]{2,6}\s+\d{4}", code_clean))

            credits_min = credits_max = None
            cm = re.search(r"(\d+)(?:\s*[-–]\s*(\d+))?", cred_raw)
            if cm:
                credits_min = int(cm.group(1))
                credits_max = int(cm.group(2)) if cm.group(2) else credits_min

            group_lower = current_group.lower()
            if any(w in group_lower for w in ("elective", "choose", "select", "option")):
                req_type = "elective_option"
            elif is_course:
                req_type = "required"
            else:
                req_type = "elective_placeholder"

            # Skip if already captured from roadmap as required
            if is_course and code_clean in seen_codes and req_type == "required":
                continue

            requirements.append({
                "course_code":       code_clean if is_course else None,
                "course_title":      title_raw or None,
                "credits_min":       credits_min,
                "credits_max":       credits_max,
                "requirement_type":  req_type,
                "requirement_group": current_group,
                "sort_order":        sort_order,
            })
            sort_order += 1

    return requirements


def extract_subject_codes(requirements: list[dict]) -> list[str]:
    """Derive primary subject codes from required courses, ordered by frequency."""
    counts: dict[str, int] = {}
    for r in requirements:
        code = r.get("course_code") or ""
        m = re.match(r"^([A-Z]{2,6})\s+\d", code)
        if m and r.get("requirement_type") == "required":
            subj = m.group(1)
            counts[subj] = counts.get(subj, 0) + 1
    return [s for s, _ in sorted(counts.items(), key=lambda x: -x[1])][:8]


def scrape_major(url: str, college: str) -> dict | None:
    soup = fetch(url)
    if not soup:
        return None

    # Skip the site-wide "2025-2026 Academic Catalog" H1; find the page-specific one
    major_name = None
    for h1 in soup.find_all("h1"):
        text = h1.get_text(strip=True)
        if "academic catalog" not in text.lower() and text:
            major_name = text
            break
    # Fallback: derive from breadcrumb last segment or URL
    if not major_name:
        breadcrumb = soup.select("nav[aria-label='breadcrumb'] li, .breadcrumb li, ol.breadcrumb li")
        if breadcrumb:
            major_name = breadcrumb[-1].get_text(strip=True)
        else:
            slug = url.rstrip("/").split("/")[-1]
            major_name = slug.replace("-", " ").title()
    major_name = re.sub(r"\s+Major$", "", major_name).strip()

    degree        = extract_degree(soup, url)
    total_credits = extract_total_credits(soup)
    requirements  = parse_curriculum_table(soup)
    subject_codes = extract_subject_codes(requirements)

    if not requirements:
        print(f"    WARNING: no requirements parsed for {major_name}")

    return {
        "major_name":    major_name,
        "degree":        degree,
        "college":       college,
        "catalog_url":   url,
        "total_credits": total_credits,
        "subject_codes": subject_codes,
        "requirements":  requirements,
    }


# ── Supabase upload ───────────────────────────────────────────────────────────

def upload(supabase: Client, all_majors: list[dict]):
    print(f"\nUploading {len(all_majors)} majors to Supabase...")

    for major in all_majors:
        # Upsert major row (unique on catalog_url)
        major_row = {
            "major_name":    major["major_name"],
            "degree":        major["degree"],
            "college":       major["college"],
            "catalog_url":   major["catalog_url"],
            "total_credits": major["total_credits"],
            "subject_codes": major["subject_codes"],
        }
        result = supabase.table("majors").upsert(
            major_row, on_conflict="catalog_url"
        ).execute()

        if not result.data:
            print(f"  FAILED to upsert major: {major['major_name']}")
            continue

        major_id = result.data[0]["id"]

        # Delete existing requirements for this major (clean re-import)
        supabase.table("major_requirements").delete().eq("major_id", major_id).execute()

        # Batch-insert requirements in chunks of 200
        reqs = [
            {
                "major_id":          major_id,
                "course_code":       r["course_code"],
                "course_title":      r["course_title"],
                "credits_min":       r["credits_min"],
                "credits_max":       r["credits_max"],
                "requirement_type":  r["requirement_type"],
                "requirement_group": r["requirement_group"],
                "sort_order":        r["sort_order"],
            }
            for r in major["requirements"]
        ]
        for i in range(0, len(reqs), 200):
            chunk = reqs[i:i + 200]
            supabase.table("major_requirements").insert(chunk).execute()

        print(f"  ✓ {major['major_name']} — {len(reqs)} requirements")

    print("\nDone.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    supabase_url = os.environ.get("SUPABASE_URL", "https://rpmgcurhxrgtzbdixtay.supabase.co")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_key:
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY not set.")
        print("Get it from: Supabase Dashboard → Project Settings → API → service_role")
        return

    supabase: Client = create_client(supabase_url, supabase_key)

    all_majors: list[dict] = []

    for college_name, college_url in COLLEGE_URLS:
        print(f"\n{'='*60}")
        print(f"  {college_name}")
        print(f"{'='*60}")

        major_urls = find_major_urls(college_url)
        print(f"  Found {len(major_urls)} majors")
        time.sleep(SLEEP_BETWEEN)

        for url in major_urls:
            print(f"\n  → {url.split('/undergraduate/')[-1]}")
            data = scrape_major(url, college_name)
            if data:
                all_majors.append(data)
                print(f"     {data['major_name']} | {data['total_credits']} cr | "
                      f"{len(data['requirements'])} reqs | {data['subject_codes']}")
            time.sleep(SLEEP_BETWEEN)

    # Save raw JSON as backup
    backup_path = os.path.join(os.path.dirname(__file__), "catalog_data_backup.json")
    with open(backup_path, "w") as f:
        json.dump(all_majors, f, indent=2)
    print(f"\nBackup written to {backup_path}")

    print(f"\nTotal majors scraped: {len(all_majors)}")
    upload(supabase, all_majors)


if __name__ == "__main__":
    main()
