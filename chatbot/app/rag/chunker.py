"""
app/rag/chunker.py

Improved document chunking for the Darvis RAG system.

Problem with old chunking:
  - Major requirements were crammed into one giant chunk per major
    (Computer Science B.S. had 100+ courses in a single text blob).
  - No overlap between chunks — context was lost at chunk boundaries.
  - Content was minimal — course chunks had only title + avg GPA.

Improvements:
  - Major requirements split by requirement_group (8–15 courses per chunk,
    ~300–600 tokens) with group context preserved in each chunk.
  - Grade chunks include per-term trend signal ("improving", "declining").
  - Course chunks include all grade distribution percentages when available.
  - Instructor chunks include courses taught list for better "who teaches X" answers.
  - All chunks carry structured metadata for filtered retrieval.

Token estimates:
  - 1 token ≈ 4 characters; target 300–800 tokens ≈ 1200–3200 chars.
  - Grade chunks: ~300–500 chars per chunk (well within target).
  - Requirement group chunks: ~400–800 chars per chunk.
  - Course chunks: ~200–400 chars per chunk.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field

import pandas as pd

logger = logging.getLogger("darvis.chunker")


@dataclass
class Chunk:
    """A single text chunk ready for embedding and upsert to Supabase."""
    source_type: str          # "course" | "grade" | "requirement" | "instructor"
    source_id: str            # unique key for upsert deduplication
    content: str              # the text to embed
    metadata: dict = field(default_factory=dict)

    def to_db_row(self) -> dict:
        return {
            "source_type": self.source_type,
            "source_id": self.source_id,
            "content": self.content,
            "metadata": json.dumps(self.metadata),
        }


class DocumentChunker:
    """
    Builds Chunk lists from the in-memory DataFrames loaded at startup.
    Designed to be called by the rebuild_embeddings script.
    """

    # ── Course chunks ───────────────────────────────────────────────────────────

    @staticmethod
    def chunk_courses(courses_df: pd.DataFrame) -> list[Chunk]:
        """One chunk per course, including grade distribution when available."""
        chunks = []
        for _, r in courses_df.iterrows():
            subj = str(r.get("subject", ""))
            num = str(r.get("course_number", ""))
            title = str(r.get("title") or f"{subj} {num}")
            credits = r.get("credits")
            avg_gpa = r.get("avg_gpa")
            sections = r.get("total_sections")
            pathways = r.get("pathways")

            parts = [f"Course {subj} {num}: {title}."]
            if credits:
                parts.append(f"Credits: {credits}.")
            if pd.notna(avg_gpa):
                parts.append(f"Average GPA: {round(float(avg_gpa), 2)}.")
            if sections:
                parts.append(f"Fall 2026 sections available: {int(sections)}.")
            if isinstance(pathways, list) and pathways:
                parts.append(f"VT Pathways: {', '.join(pathways)}.")

            # Include grade distribution percentages if available
            for grade, col in [("A", "a_pct"), ("F", "f_pct")]:
                val = r.get(col)
                if val is not None and pd.notna(val):
                    parts.append(f"{grade} rate: {round(float(val), 1)}%.")

            chunks.append(Chunk(
                source_type="course",
                source_id=f"{subj.lower()}-{num}",
                content=" ".join(parts),
                metadata={"subject": subj, "course_number": num, "title": title},
            ))
        logger.info("[chunker] Built %d course chunks", len(chunks))
        return chunks

    # ── Grade chunks ─────────────────────────────────────────────────────────────

    @staticmethod
    def chunk_grades(grades_df: pd.DataFrame) -> list[Chunk]:
        """
        One chunk per (course, instructor) with aggregated stats + trend signal.
        Richer than the old version: includes withdrawals, enrollment confidence,
        and a directional trend description.
        """
        if grades_df.empty:
            return []

        # Columns we need (using the renamed DataFrame column names)
        needed = ["Subject", "Course No.", "Course Title", "Instructor",
                  "GPA", "A (%)", "F (%)", "Graded Enrollment",
                  "Withdraws", "Academic Year", "Term"]
        available = [c for c in needed if c in grades_df.columns]
        work = grades_df[available].copy()

        # Sort by year/term so trend detection works
        if "Academic Year" in work.columns:
            work = work.sort_values("Academic Year")

        chunks: list[Chunk] = []
        group_cols = ["Subject", "Course No.", "Course Title", "Instructor"]
        group_cols = [c for c in group_cols if c in work.columns]

        for keys, group in work.groupby(group_cols, dropna=False):
            if not isinstance(keys, tuple):
                keys = (keys,)
            record = dict(zip(group_cols, keys))

            subj = str(record.get("Subject", ""))
            num = str(record.get("Course No.", ""))
            title = str(record.get("Course Title", "") or f"{subj} {num}")
            instr = str(record.get("Instructor", "Staff") or "Staff")

            def safe_avg(col: str) -> float | None:
                if col not in group.columns:
                    return None
                vals = pd.to_numeric(group[col], errors="coerce").dropna()
                return round(float(vals.mean()), 2) if not vals.empty else None

            avg_gpa = safe_avg("GPA")
            avg_a = safe_avg("A (%)")
            avg_f = safe_avg("F (%)")
            total_students = int(pd.to_numeric(
                group.get("Graded Enrollment", pd.Series()), errors="coerce"
            ).fillna(0).sum())
            total_withdraws = int(pd.to_numeric(
                group.get("Withdraws", pd.Series()), errors="coerce"
            ).fillna(0).sum())
            terms_taught = len(group)

            # Trend: compare first-half vs second-half average GPA
            trend = ""
            if "GPA" in group.columns and len(group) >= 4:
                gpas = pd.to_numeric(group["GPA"], errors="coerce").dropna().tolist()
                if len(gpas) >= 4:
                    mid = len(gpas) // 2
                    early_avg = sum(gpas[:mid]) / mid
                    recent_avg = sum(gpas[mid:]) / (len(gpas) - mid)
                    diff = recent_avg - early_avg
                    if diff > 0.1:
                        trend = " Grade outcomes are improving in recent terms."
                    elif diff < -0.1:
                        trend = " Grade outcomes have declined in recent terms."

            parts = [f"Grade data for {subj} {num} ({title}) taught by {instr}."]
            if avg_gpa is not None:
                parts.append(f"Average GPA: {avg_gpa}.")
            if avg_a is not None:
                parts.append(f"A/A- rate: {avg_a}%.")
            if avg_f is not None:
                parts.append(f"F rate: {avg_f}%.")
            if total_students:
                parts.append(f"Total students taught: {total_students}.")
            if total_withdraws:
                parts.append(f"Total withdrawals: {total_withdraws}.")
            if terms_taught:
                parts.append(f"Sections taught: {terms_taught} terms.")
            if trend:
                parts.append(trend.strip())

            safe_id = (
                f"{subj.lower()}-{num}-"
                f"{instr.lower().replace(',', '').replace(' ', '_')[:30]}"
            )
            chunks.append(Chunk(
                source_type="grade",
                source_id=safe_id,
                content=" ".join(parts),
                metadata={
                    "subject": subj,
                    "course_number": num,
                    "instructor": instr,
                    "avg_gpa": avg_gpa,
                    "total_students": total_students,
                },
            ))

        logger.info("[chunker] Built %d grade chunks", len(chunks))
        return chunks

    # ── Major requirement chunks ─────────────────────────────────────────────────

    @staticmethod
    def chunk_requirements(requirements_df: pd.DataFrame) -> list[Chunk]:
        """
        Split major requirements by requirement_group (~8–15 courses each)
        instead of one giant chunk per major.
        This keeps each chunk under 600 tokens and improves precision
        when retrieving "what are the CS core requirements?" vs "CS electives".
        """
        if requirements_df.empty:
            return []

        chunks: list[Chunk] = []
        group_cols = ["major_name", "requirement_type", "requirement_group"]
        available = [c for c in group_cols if c in requirements_df.columns]

        for keys, group in requirements_df.groupby(available, dropna=False):
            if not isinstance(keys, tuple):
                keys = (keys,)
            record = dict(zip(available, keys))

            major = str(record.get("major_name", ""))
            rtype = str(record.get("requirement_type", "") or "Requirement")
            rgroup = str(record.get("requirement_group", "") or "")
            college = str(group["college"].iloc[0]) if "college" in group.columns else ""
            degree = str(group["degree"].iloc[0]) if "degree" in group.columns else "B.S."

            courses: list[str] = []
            for _, row in group.iterrows():
                code = str(row.get("course_code", "") or "")
                title = str(row.get("course_title", "") or "")
                credits = row.get("credits_min")
                entry = code
                if title and title != code:
                    entry += f" ({title})"
                if credits and pd.notna(credits):
                    entry += f" {int(credits)}cr"
                if entry.strip():
                    courses.append(entry.strip())

            if not courses:
                continue

            header = f"{major} major ({degree})"
            if college:
                header += f" — {college}"
            header += f". {rtype}"
            if rgroup and rgroup not in ("nan", "None"):
                header += f" — {rgroup}"
            header += ":"

            course_list = ", ".join(courses)
            content = f"{header} {course_list}."

            group_slug = rgroup.lower().replace(" ", "_").replace("/", "_")[:20] if rgroup else "main"
            # Add a 6-char content hash to prevent collisions when different majors/groups
            # produce the same truncated prefix (e.g. long major names that share a prefix).
            _hash = hashlib.md5(f"{major}|{rtype}|{rgroup}".encode()).hexdigest()[:6]
            source_id = (
                f"req-{major.lower().replace(' ', '_')[:25]}"
                f"-{rtype.lower()[:10]}-{group_slug}-{_hash}"
            )
            chunks.append(Chunk(
                source_type="requirement",
                source_id=source_id,
                content=content,
                metadata={
                    "major_name": major,
                    "college": college,
                    "degree": degree,
                    "requirement_type": rtype,
                    "requirement_group": rgroup,
                    "course_count": len(courses),
                },
            ))

        logger.info("[chunker] Built %d requirement chunks", len(chunks))
        return chunks

    # ── Instructor chunks ────────────────────────────────────────────────────────

    @staticmethod
    def chunk_instructors(
        rmp_df: pd.DataFrame,
        grades_df: pd.DataFrame | None = None,
    ) -> list[Chunk]:
        """
        One chunk per instructor. Includes RMP data, overall stats, and
        a summary of courses taught (for "who teaches X?" queries).
        """
        if rmp_df.empty:
            return []

        chunks: list[Chunk] = []

        # Pre-aggregate courses taught per instructor from grades
        courses_by_instr: dict[str, list[str]] = {}
        if grades_df is not None and not grades_df.empty and "Instructor" in grades_df.columns:
            for (instr, subj, num), _ in grades_df.groupby(
                ["Instructor", "Subject", "Course No."], dropna=False
            ):
                key = str(instr or "")
                if key:
                    courses_by_instr.setdefault(key, []).append(f"{subj} {num}")

        for _, r in rmp_df.iterrows():
            name = str(r.get("name", "") or "")
            if not name:
                continue

            subjects = r.get("subjects") or []
            course_count = r.get("course_count") or 0
            avg_gpa = r.get("avg_gpa")
            rmp_rating = r.get("rmp_rating")
            rmp_diff = r.get("rmp_difficulty")
            rmp_count = r.get("rmp_count") or 0

            parts = [f"Instructor {name} at Virginia Tech."]
            if isinstance(subjects, list) and subjects:
                parts.append(f"Teaches {', '.join(subjects)} courses.")
            if course_count:
                parts.append(f"Has taught {course_count} distinct courses.")
            if avg_gpa and pd.notna(avg_gpa):
                parts.append(f"Average GPA across all sections: {round(float(avg_gpa), 2)}.")
            if rmp_rating and pd.notna(rmp_rating):
                parts.append(
                    f"RateMyProfessors: {round(float(rmp_rating), 1)}/5.0 "
                    f"({rmp_count} ratings)."
                )
            if rmp_diff and pd.notna(rmp_diff):
                parts.append(f"RMP difficulty: {round(float(rmp_diff), 1)}/5.0.")

            # Include courses taught from grade data for "who teaches X?" queries
            taught = courses_by_instr.get(name, [])
            if taught:
                unique_courses = sorted(set(taught))[:10]  # cap to avoid bloat
                parts.append(f"Courses taught include: {', '.join(unique_courses)}.")

            safe_id = name.lower().replace(",", "").replace(" ", "_")[:40]
            chunks.append(Chunk(
                source_type="instructor",
                source_id=safe_id,
                content=" ".join(parts),
                metadata={
                    "name": name,
                    "avg_gpa": float(avg_gpa) if avg_gpa and pd.notna(avg_gpa) else None,
                    "rmp_rating": float(rmp_rating) if rmp_rating and pd.notna(rmp_rating) else None,
                },
            ))

        logger.info("[chunker] Built %d instructor chunks", len(chunks))
        return chunks

    # ── Section chunks ───────────────────────────────────────────────────────────

    @staticmethod
    def chunk_sections(sections: list[dict]) -> list["Chunk"]:
        """
        One chunk per (subject, course_number, instructor) group summarising
        all Fall 2026 sections for that offering — so a question like
        "what time does ECE 2004 meet?" or "who teaches CS 3114 in Fall 2026?"
        retrieves a useful, compact context block.
        """
        if not sections:
            return []

        from collections import defaultdict
        groups: dict[tuple, list[dict]] = defaultdict(list)
        for sec in sections:
            key = (
                str(sec.get("subject") or ""),
                str(sec.get("course_number") or ""),
                str(sec.get("instructor") or "Staff"),
            )
            groups[key].append(sec)

        chunks: list[Chunk] = []
        for (subj, num, instr), secs in groups.items():
            section_descs = []
            for sec in secs:
                days = sec.get("days") or []
                days_str = "".join(days) if isinstance(days, list) else str(days)
                start = str(sec.get("start_time") or "")[:5]
                end = str(sec.get("end_time") or "")[:5]
                location = sec.get("location") or "TBA"
                crn = sec.get("crn") or ""
                seats = int(sec.get("seats") or 0)
                enrolled = int(sec.get("enrolled") or 0)
                open_seats = max(0, seats - enrolled) if seats else 0
                desc = f"CRN {crn}: {days_str} {start}-{end} {location}"
                if open_seats:
                    desc += f" ({open_seats} seats open)"
                section_descs.append(desc)

            credits = secs[0].get("credits") if secs else None
            parts = [f"Fall 2026 section: {subj} {num} taught by {instr}."]
            if credits:
                parts.append(f"Credits: {credits}.")
            parts.append("Sections: " + "; ".join(section_descs) + ".")

            safe_instr = instr.lower().replace(",", "").replace(" ", "_")[:20]
            chunks.append(Chunk(
                source_type="section",
                source_id=f"sec-{subj.lower()}-{num}-{safe_instr}",
                content=" ".join(parts),
                metadata={"subject": subj, "course_number": num, "instructor": instr},
            ))

        logger.info("[chunker] Built %d section chunks", len(chunks))
        return chunks

    # ── Convenience: build all ───────────────────────────────────────────────────

    @classmethod
    def build_all(
        cls,
        grades_df: pd.DataFrame,
        courses_df: pd.DataFrame,
        requirements_df: pd.DataFrame,
        rmp_df: pd.DataFrame,
        sections: list[dict] | None = None,
    ) -> list[Chunk]:
        all_chunks: list[Chunk] = []
        all_chunks.extend(cls.chunk_courses(courses_df))
        all_chunks.extend(cls.chunk_grades(grades_df))
        all_chunks.extend(cls.chunk_requirements(requirements_df))
        all_chunks.extend(cls.chunk_instructors(rmp_df, grades_df))
        if sections:
            all_chunks.extend(cls.chunk_sections(sections))
        logger.info("[chunker] Total chunks built: %d", len(all_chunks))
        return all_chunks
