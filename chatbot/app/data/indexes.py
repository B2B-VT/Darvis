"""
app/data/indexes.py

Precomputed in-memory indexes built once at startup from the loaded DataFrames.

Every per-request scan that used to iterate the full 59,790-row grades frame
(e.g. schedule_builder's instructor-GPA map) becomes an O(1) dict lookup here.
All aggregates are enrollment-weighted — a section of 300 students moves the
average 10x more than a section of 30.

Build cost: one pass over each DataFrame at startup (~1-2s). Request cost: dict
lookups only. Thread-safe after construction (read-only).
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass

import pandas as pd

logger = logging.getLogger("darvis.indexes")


def norm_name(name: str) -> str:
    """Normalize an instructor name for matching: lowercase, collapse spaces, strip punctuation."""
    n = re.sub(r"[^\w\s]", " ", str(name or "").lower())
    return re.sub(r"\s+", " ", n).strip()


def last_name(name: str) -> str:
    """Extract lowercase last name from 'Last, First', 'First Last', or bare 'Last'."""
    n = str(name or "").strip()
    if "," in n:
        return norm_name(n.split(",")[0])
    parts = norm_name(n).split()
    return parts[-1] if parts else ""


def norm_course_key(subject: str, course_no) -> tuple[str, str]:
    return (str(subject or "").strip().upper(), str(course_no or "").strip())


@dataclass
class InstructorAgg:
    """Enrollment-weighted aggregate for one instructor (optionally within one course)."""
    name: str = ""
    weighted_gpa: float | None = None
    total_students: int = 0
    terms_taught: int = 0
    a_rate: float | None = None       # A + A- (%)
    f_rate: float | None = None
    total_withdraws: int = 0

    @property
    def withdraw_rate(self) -> float | None:
        if self.total_students <= 0:
            return None
        return round(100.0 * self.total_withdraws / self.total_students, 2)


@dataclass
class CourseAgg:
    """Enrollment-weighted aggregate for one course across all instructors/terms."""
    subject: str = ""
    course_number: str = ""
    title: str = ""
    weighted_gpa: float | None = None
    total_students: int = 0
    terms_count: int = 0
    instructors_count: int = 0
    a_rate: float | None = None
    f_rate: float | None = None


class _WeightedAcc:
    """Accumulates enrollment-weighted sums for gpa/a/f plus counters."""

    __slots__ = ("gpa_sum", "a_sum", "f_sum", "enroll", "withdraws", "terms", "title")

    def __init__(self):
        self.gpa_sum = 0.0
        self.a_sum = 0.0
        self.f_sum = 0.0
        self.enroll = 0.0
        self.withdraws = 0
        self.terms: set = set()
        self.title = ""

    def add(self, gpa, a_pct, a_minus_pct, f_pct, enroll, withdraws, term_key, title=""):
        if enroll is None or enroll != enroll or enroll <= 0:  # NaN guard
            return
        e = float(enroll)
        if gpa is not None and gpa == gpa:
            self.gpa_sum += float(gpa) * e
        a_total = 0.0
        if a_pct is not None and a_pct == a_pct:
            a_total += float(a_pct)
        if a_minus_pct is not None and a_minus_pct == a_minus_pct:
            a_total += float(a_minus_pct)
        self.a_sum += a_total * e
        if f_pct is not None and f_pct == f_pct:
            self.f_sum += float(f_pct) * e
        self.enroll += e
        if withdraws is not None and withdraws == withdraws:
            self.withdraws += int(withdraws)
        self.terms.add(term_key)
        if title and not self.title:
            self.title = str(title)

    def gpa(self) -> float | None:
        return round(self.gpa_sum / self.enroll, 3) if self.enroll > 0 else None

    def a(self) -> float | None:
        return round(self.a_sum / self.enroll, 2) if self.enroll > 0 else None

    def f(self) -> float | None:
        return round(self.f_sum / self.enroll, 2) if self.enroll > 0 else None


class DataIndexes:
    """
    All precomputed lookups. Constructed once in the FastAPI lifespan and stored
    in STATE["indexes"].
    """

    def __init__(
        self,
        grades_df: pd.DataFrame | None = None,
        courses_df: pd.DataFrame | None = None,
        sections_df: pd.DataFrame | None = None,
        instructors_df: pd.DataFrame | None = None,
        supabase_client=None,
    ):
        # instructor last-name (lowercase) → overall InstructorAgg
        self.instructor_by_last: dict[str, InstructorAgg] = {}
        # normalized full name → InstructorAgg (higher precision than last name)
        self.instructor_by_name: dict[str, InstructorAgg] = {}
        # (SUBJ, NUM) → CourseAgg
        self.course_stats: dict[tuple[str, str], CourseAgg] = {}
        # (SUBJ, NUM) → list[InstructorAgg] sorted by weighted GPA desc
        self.course_instructor_stats: dict[tuple[str, str], list[InstructorAgg]] = {}
        # (SUBJ, NUM) → course title
        self.course_titles: dict[tuple[str, str], str] = {}
        # (SUBJ, NUM) → credit hours, once populated
        self.course_credits: dict[tuple[str, str], float] = {}
        # (SUBJ, NUM) → list of section record dicts (current term)
        self.sections_by_course: dict[tuple[str, str], list[dict]] = defaultdict(list)
        # instructor last name → list of section record dicts
        self.sections_by_instructor: dict[str, list[dict]] = defaultdict(list)
        # last name → {"rating": float, "difficulty": float|None, "count": int, "name": str}
        self.rmp_by_last: dict[str, dict] = {}
        # canonical sets for validation
        self.known_subjects: set[str] = set()
        self.known_course_codes: set[tuple[str, str]] = set()
        # catalog fields confirmed empty in the live DB — used for honest "no data" answers
        self.empty_course_fields: set[str] = set()
        # (SUBJ, NUM) → catalog description / prerequisite text, once populated
        self.course_descriptions: dict[tuple[str, str], str] = {}
        self.course_prerequisites: dict[tuple[str, str], str] = {}
        # major_name_lower → set of required course_code strings (e.g. "CS 3114")
        self.required_by_major: dict[str, set[str]] = {}

        if grades_df is not None and not grades_df.empty:
            self._build_grade_indexes(grades_df)
        if courses_df is not None and not courses_df.empty:
            self._build_course_indexes(courses_df)
        if sections_df is not None and not sections_df.empty:
            self._build_section_indexes(sections_df)
        if instructors_df is not None and not instructors_df.empty:
            self._build_rmp_index(instructors_df)
        if supabase_client is not None:
            self._build_major_index(supabase_client)

        logger.info(
            "[indexes] built: %d courses, %d course-instructor pairs, %d instructors, "
            "%d courses with sections, %d RMP entries",
            len(self.course_stats),
            sum(len(v) for v in self.course_instructor_stats.values()),
            len(self.instructor_by_name),
            len(self.sections_by_course),
            len(self.rmp_by_last),
        )

    # ── builders ──────────────────────────────────────────────────────────────

    def _build_grade_indexes(self, df: pd.DataFrame) -> None:
        cols = df.columns
        need = ["Subject", "Course No.", "Instructor", "GPA", "Graded Enrollment"]
        if any(c not in cols for c in need):
            logger.warning("[indexes] grades frame missing columns — skipping grade indexes")
            return

        term_cols = [c for c in ("Academic Year", "Term") if c in cols]

        by_course: dict[tuple[str, str], _WeightedAcc] = defaultdict(_WeightedAcc)
        by_course_inst: dict[tuple[str, str, str], _WeightedAcc] = defaultdict(_WeightedAcc)
        by_inst: dict[str, _WeightedAcc] = defaultdict(_WeightedAcc)
        inst_display: dict[str, str] = {}

        # itertuples is ~50x faster than iterrows; one pass over 59,790 rows.
        col_idx = {c: i for i, c in enumerate(cols)}

        def _get(row, col):
            return row[col_idx[col]] if col in col_idx else None

        for row in df.itertuples(index=False, name=None):
            subj = str(_get(row, "Subject") or "").strip().upper()
            num = str(_get(row, "Course No.") or "").strip()
            inst = str(_get(row, "Instructor") or "").strip()
            if not subj or not num:
                continue
            gpa = _get(row, "GPA")
            enroll = _get(row, "Graded Enrollment")
            a_pct = _get(row, "A (%)")
            am_pct = _get(row, "A- (%)")
            f_pct = _get(row, "F (%)")
            wd = _get(row, "Withdraws")
            title = _get(row, "Course Title") or ""
            term_key = tuple(_get(row, c) for c in term_cols) if term_cols else None

            key = (subj, num)
            self.known_subjects.add(subj)
            self.known_course_codes.add(key)
            by_course[key].add(gpa, a_pct, am_pct, f_pct, enroll, wd, term_key, title)
            if inst and inst.upper() not in ("STAFF", "TBA"):
                nname = norm_name(inst)
                inst_display.setdefault(nname, inst)
                by_course_inst[(subj, num, nname)].add(gpa, a_pct, am_pct, f_pct, enroll, wd, term_key)
                by_inst[nname].add(gpa, a_pct, am_pct, f_pct, enroll, wd, term_key)

        for key, acc in by_course.items():
            self.course_stats[key] = CourseAgg(
                subject=key[0], course_number=key[1], title=acc.title,
                weighted_gpa=acc.gpa(), total_students=int(acc.enroll),
                terms_count=len(acc.terms), a_rate=acc.a(), f_rate=acc.f(),
            )
            if acc.title:
                self.course_titles[key] = acc.title

        per_course: dict[tuple[str, str], list[InstructorAgg]] = defaultdict(list)
        for (subj, num, nname), acc in by_course_inst.items():
            per_course[(subj, num)].append(InstructorAgg(
                name=inst_display.get(nname, nname),
                weighted_gpa=acc.gpa(), total_students=int(acc.enroll),
                terms_taught=len(acc.terms), a_rate=acc.a(), f_rate=acc.f(),
                total_withdraws=acc.withdraws,
            ))
        for key, aggs in per_course.items():
            aggs.sort(key=lambda a: (a.weighted_gpa or 0.0), reverse=True)
            self.course_instructor_stats[key] = aggs
            self.course_stats[key].instructors_count = len(aggs)

        for nname, acc in by_inst.items():
            agg = InstructorAgg(
                name=inst_display.get(nname, nname),
                weighted_gpa=acc.gpa(), total_students=int(acc.enroll),
                terms_taught=len(acc.terms), a_rate=acc.a(), f_rate=acc.f(),
                total_withdraws=acc.withdraws,
            )
            self.instructor_by_name[nname] = agg
            ln = last_name(agg.name)
            # First occurrence wins on last-name collisions; full-name map is authoritative
            if ln and ln not in self.instructor_by_last:
                self.instructor_by_last[ln] = agg

    def _build_course_indexes(self, df: pd.DataFrame) -> None:
        field_nonnull: dict[str, int] = {"description": 0, "pathways": 0, "prerequisites": 0}
        cols = set(df.columns)
        for rec in df.to_dict("records"):
            subj = str(rec.get("subject") or "").strip().upper()
            num = str(rec.get("course_number") or "").strip()
            if not subj or not num:
                continue
            key = (subj, num)
            self.known_subjects.add(subj)
            self.known_course_codes.add(key)
            title = str(rec.get("title") or "").strip()
            if title and key not in self.course_titles:
                self.course_titles[key] = title
            credits = rec.get("credits")
            if credits is not None and str(credits).strip() not in ("", "nan", "None"):
                try:
                    self.course_credits[key] = float(credits)
                except (TypeError, ValueError):
                    pass
            for f in list(field_nonnull):
                if f not in cols:
                    continue
                val = rec.get(f)
                if val is not None and str(val).strip() not in ("", "[]", "{}", "None", "nan"):
                    field_nonnull[f] += 1
                    if f == "description":
                        self.course_descriptions[key] = str(val).strip()
                    elif f == "prerequisites":
                        self.course_prerequisites[key] = str(val).strip()
        # Record catalog fields that are empty across the entire table so answer
        # generation can say "Darvis doesn't have this data" instead of guessing.
        for f, n in field_nonnull.items():
            if n == 0:
                self.empty_course_fields.add(f)

    def _build_section_indexes(self, df: pd.DataFrame) -> None:
        import math
        for rec in df.to_dict("records"):
            clean = {
                k: (None if isinstance(v, float) and math.isnan(v) else v)
                for k, v in rec.items()
            }
            key = norm_course_key(clean.get("subject"), clean.get("course_number"))
            if key[0] and key[1]:
                self.sections_by_course[key].append(clean)
            ln = last_name(clean.get("instructor") or "")
            if ln:
                self.sections_by_instructor[ln].append(clean)

    def _build_rmp_index(self, df: pd.DataFrame) -> None:
        if "name" not in df.columns or "rmp_rating" not in df.columns:
            return
        for rec in df.to_dict("records"):
            rating = rec.get("rmp_rating")
            if rating is None or rating != rating:
                continue
            name = str(rec.get("name") or "")
            ln = last_name(name)
            if ln and ln not in self.rmp_by_last:
                diff = rec.get("rmp_difficulty")
                cnt = rec.get("rmp_count", 0)
                self.rmp_by_last[ln] = {
                    "name": name,
                    "rating": float(rating),
                    "difficulty": float(diff) if diff is not None and diff == diff else None,
                    "count": int(cnt) if cnt is not None and cnt == cnt else 0,
                }

    def _build_major_index(self, supabase_client) -> None:
        """Query majors + major_requirements once at startup and build
        required_by_major, so schedule_builder can do an O(1) lookup instead
        of a live Supabase query on every request."""
        try:
            majors = supabase_client.table("majors").select("id, major_name").execute().data or []
            major_name_by_id = {m["id"]: str(m.get("major_name") or "").strip().lower() for m in majors}
            if not major_name_by_id:
                return

            BATCH = 1000
            offset = 0
            req_rows: list[dict] = []
            while True:
                page = (
                    supabase_client.table("major_requirements")
                    .select("major_id, course_code")
                    .eq("requirement_type", "required")
                    .order("id")
                    .range(offset, offset + BATCH - 1)
                    .execute()
                    .data or []
                )
                req_rows.extend(page)
                if len(page) < BATCH:
                    break
                offset += BATCH

            for row in req_rows:
                major_name = major_name_by_id.get(row.get("major_id"))
                raw_code = row.get("course_code")
                if not major_name or not raw_code:
                    continue
                code = re.sub(r"\s+", " ", str(raw_code).strip().upper())
                self.required_by_major.setdefault(major_name, set()).add(code)

            logger.info("[indexes] built required_by_major: %d majors", len(self.required_by_major))
        except Exception as exc:
            logger.warning("[indexes] failed to build major index: %s", exc)

    # ── lookups ───────────────────────────────────────────────────────────────

    def instructor_gpa(self, instructor: str) -> float | None:
        """Enrollment-weighted overall GPA for an instructor, by full name then last name."""
        agg = self.instructor_by_name.get(norm_name(instructor))
        if agg is None:
            agg = self.instructor_by_last.get(last_name(instructor))
        return agg.weighted_gpa if agg else None

    def instructor_course_stats(self, subject: str, course_no: str) -> list[InstructorAgg]:
        return self.course_instructor_stats.get(norm_course_key(subject, course_no), [])

    def course(self, subject: str, course_no: str) -> CourseAgg | None:
        return self.course_stats.get(norm_course_key(subject, course_no))

    def sections_for(self, subject: str, course_no: str) -> list[dict]:
        return self.sections_by_course.get(norm_course_key(subject, course_no), [])

    def rmp(self, instructor: str) -> dict | None:
        return self.rmp_by_last.get(last_name(instructor))

    def course_exists(self, subject: str, course_no: str) -> bool:
        return norm_course_key(subject, course_no) in self.known_course_codes
