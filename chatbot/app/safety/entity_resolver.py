"""
app/safety/entity_resolver.py

Fuzzy entity resolution for professor names and course codes extracted from
student questions. Corrects typos like "Hamuda" → "Hamouda" using the
actual Instructor column from the loaded grades DataFrame.

Initialize once at startup with the loaded DataFrames; thread-safe (read-only).
Called after LLM intent extraction to clean up extracted entities before routing.
"""

from __future__ import annotations

import difflib
import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger("darvis.entity_resolver")

_PROF_CUTOFF = 0.75   # minimum fuzzy-match confidence for professor names
_SUBJ_CUTOFF = 0.80   # minimum fuzzy-match confidence for subject codes


class EntityResolver:
    """
    Resolves professor names and course codes against loaded DataFrames.
    Call resolve_professor() and resolve_course_code() after intent extraction.
    """

    def __init__(
        self,
        grades_df: "pd.DataFrame | None",
        courses_df: "pd.DataFrame | None",
    ) -> None:
        self._professor_names: list[str] = []
        self._professor_last_names: list[str] = []
        self._course_codes: set[str] = set()

        if grades_df is not None and not grades_df.empty:
            if "Instructor" in grades_df.columns:
                raw = grades_df["Instructor"].dropna().unique()
                self._professor_names = [
                    str(n).strip()
                    for n in raw
                    if str(n).strip().upper() not in ("STAFF", "TBA", "")
                ]
                self._professor_last_names = [
                    p.split()[-1] for p in self._professor_names if p.split()
                ]

            if "Subject" in grades_df.columns and "Course No." in grades_df.columns:
                for _, row in grades_df[["Subject", "Course No."]].drop_duplicates().iterrows():
                    subj = str(row["Subject"]).strip().upper()
                    num = str(row["Course No."]).strip()
                    if subj and num:
                        self._course_codes.add(f"{subj} {num}")

        if courses_df is not None and not courses_df.empty:
            for _, row in courses_df.iterrows():
                subj = str(row.get("subject", "")).strip().upper()
                num = str(row.get("course_number", "")).strip()
                if subj and num:
                    self._course_codes.add(f"{subj} {num}")

        logger.info(
            "[entity_resolver] Ready — %d instructors, %d course codes",
            len(self._professor_names),
            len(self._course_codes),
        )

    # ── Public API ──────────────────────────────────────────────────────────────

    def resolve_professor(self, name: str) -> str:
        """
        Fuzzy-match a professor name against known instructors.
        Returns corrected full name if confidence >= _PROF_CUTOFF, else original.
        Matches on last name to handle partial names ("Hamouda" vs "Mohamed Hamouda").
        """
        if not name or not self._professor_names:
            return name

        name = name.strip()

        # Fast path: exact case-insensitive match
        name_lower = name.lower()
        for known in self._professor_names:
            if known.lower() == name_lower:
                return known

        # Fuzzy match the last word of input against known last names
        input_parts = name.split()
        input_last = input_parts[-1] if input_parts else name

        matches = difflib.get_close_matches(
            input_last, self._professor_last_names, n=1, cutoff=_PROF_CUTOFF
        )
        if matches:
            matched_last = matches[0]
            for full_name in self._professor_names:
                if full_name.split()[-1] == matched_last:
                    if full_name != name:
                        logger.info(
                            "[entity_resolver] Professor %r → %r (fuzzy)",
                            name, full_name,
                        )
                    return full_name

        return name

    def resolve_course_code(self, subject: str, course_no: str) -> tuple[str, str]:
        """
        Validate subject+course_no against the catalog. Returns (subject, course_no)
        normalised to uppercase. If not in catalog, returns unchanged — we don't
        fabricate course codes.
        """
        if not subject or not course_no:
            return subject, course_no

        subj = subject.strip().upper()
        num = course_no.strip()
        code = f"{subj} {num}"

        if code in self._course_codes:
            return subj, num

        logger.debug("[entity_resolver] Course code %r not in catalog — keeping as-is", code)
        return subj, num

    def resolve_question_entities(self, question: str) -> tuple[str | None, str | None]:
        """
        Scan free-text for an inline professor name candidate when intent extraction
        didn't find one. Returns (resolved_professor_name, None) or (None, None).
        """
        _STOPWORDS = {
            "which", "what", "who", "how", "the", "for", "in", "is", "are",
            "best", "worst", "good", "bad", "hard", "easy", "this", "that",
            "grade", "grades", "class", "course", "courses", "gpa", "rate",
            "prof", "professor", "instructor", "cs", "ece", "math",
            # sort/quality adjectives — never a professor name
            "hardest", "easiest", "toughest", "harder", "easier", "tougher",
            "better", "worse", "brutal", "difficult", "top", "great",
            "terrible", "awful", "strongest", "weakest",
        }
        tokens = re.findall(r"\b[A-Za-z]{3,}\b", question)
        for token in tokens:
            if token.lower() in _STOPWORDS:
                continue
            # Check known last names first (exact, case-insensitive)
            for full_name in self._professor_names:
                if full_name.split()[-1].lower() == token.lower():
                    return full_name, None
            # Then try fuzzy
            candidate = token.capitalize()
            resolved = self.resolve_professor(candidate)
            if resolved != candidate:
                return resolved, None
        return None, None
