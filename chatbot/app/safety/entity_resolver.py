"""
app/safety/entity_resolver.py

Robust entity resolution for professor names and course references.

Handles typos ("Hamuda" → "Hamouda"), format variants ("cs1114", "CS-1114",
"computer science 1114"), course-title references ("intro to software design"),
and ambiguous last names — returning structured results with confidence scores
and candidate lists so callers can decide whether to answer, note an
assumption, or ask for clarification.

Matching stack (fastest first):
  1. Exact normalized dict lookup (O(1))
  2. Last-name dict lookup with ambiguity detection
  3. Fuzzy match — rapidfuzz when installed, difflib otherwise
  4. Course-title fuzzy match against the catalog

Initialize once at startup with the loaded DataFrames; read-only afterwards.
"""

from __future__ import annotations

import difflib
import logging
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd

logger = logging.getLogger("darvis.entity_resolver")

try:
    from rapidfuzz import fuzz, process as rf_process
    _HAS_RAPIDFUZZ = True
except ImportError:                      # difflib fallback — no hard dependency
    _HAS_RAPIDFUZZ = False

_PROF_CUTOFF = 0.75    # minimum confidence for professor fuzzy matches
_TITLE_CUTOFF = 0.80   # minimum confidence for course-title matches

_NON_PERSON_TOKENS = {
    "homework", "workload", "work", "load", "least", "most", "gives",
    "give", "given", "assigns", "assignment", "assignments",
}

# Stable domain aliases only — official subject names, not slang.
SUBJECT_ALIASES = {
    "computer science": "CS", "comp sci": "CS", "compsci": "CS",
    "electrical engineering": "ECE", "computer engineering": "ECE",
    "mathematics": "MATH", "math": "MATH",
    "statistics": "STAT", "stats": "STAT",
    "physics": "PHYS", "chemistry": "CHEM", "biology": "BIOL",
    "english": "ENGL", "history": "HIST", "psychology": "PSYC",
    "sociology": "SOC", "economics": "ECON", "finance": "FIN",
    "management": "MGT", "marketing": "MKTG", "accounting": "ACIS",
    "business information technology": "BIT", "business it": "BIT",
    "mechanical engineering": "ME", "aerospace engineering": "AOE",
    "civil engineering": "CEE", "industrial engineering": "ISE",
    "materials science": "MSE", "biomedical engineering": "BME",
    "chemical engineering": "CHE", "communication": "COMM",
    "philosophy": "PHIL", "architecture": "ARCH", "music": "MUS",
    "political science": "POLS", "spanish": "SPAN",
}


def _norm(s: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    s = re.sub(r"[^\w\s]", " ", str(s or "").lower())
    return re.sub(r"\s+", " ", s).strip()


def _similarity(a: str, b: str) -> float:
    if _HAS_RAPIDFUZZ:
        return fuzz.ratio(a, b) / 100.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def _best_matches(query: str, choices: list[str], limit: int = 3) -> list[tuple[str, float]]:
    """Top fuzzy matches as (choice, score 0-1), best first."""
    if not choices:
        return []
    if _HAS_RAPIDFUZZ:
        hits = rf_process.extract(query, choices, scorer=fuzz.ratio, limit=limit)
        return [(h[0], h[1] / 100.0) for h in hits]
    hits = difflib.get_close_matches(query, choices, n=limit, cutoff=0.0)
    return [(h, _similarity(query, h)) for h in hits]


@dataclass
class ResolvedEntity:
    """Structured resolution result with confidence and alternatives."""
    value: str | None = None            # resolved canonical value (or None)
    confidence: float = 0.0             # 0-1
    candidates: list[str] = field(default_factory=list)   # other plausible matches
    ambiguous: bool = False             # multiple equally-plausible matches
    warning: str | None = None          # human-readable note for low confidence
    status: str = "resolved"


@dataclass
class CourseResolution:
    raw_text: str
    normalized_code: str
    subject: str
    course_number: str
    status: str = "resolved"            # resolved | unknown | ambiguous | missing | rejected
    confidence: float = 1.0
    source: str = "exact_pattern_and_catalog_validation"
    reason: str | None = None


class EntityResolver:
    """
    Resolves professor names and course references against loaded data.
    Old callers use resolve_professor()/resolve_course_code() (string in/out);
    new callers use resolve_professor_ex()/resolve_course_ref() for structured
    results with confidence and ambiguity.
    """

    def __init__(
        self,
        grades_df: "pd.DataFrame | None",
        courses_df: "pd.DataFrame | None",
        instructors_df: "pd.DataFrame | None" = None,
        sections_df: "pd.DataFrame | None" = None,
        supabase_client=None,
    ) -> None:
        self._supabase = supabase_client
        self._professor_names: list[str] = []
        self._by_norm_name: dict[str, str] = {}          # normalized full name → canonical
        self._by_last: dict[str, list[str]] = {}         # last name → [canonical names]
        self._last_names: list[str] = []                 # unique last names for fuzzy
        self._course_codes: set[tuple[str, str]] = set() # (SUBJ, NUM)
        self._course_instructors: dict[tuple[str, str], set[str]] = {}
        self._known_subjects: set[str] = set()
        self._title_to_code: dict[str, tuple[str, str]] = {}  # normalized title → (SUBJ, NUM)
        self._titles: list[str] = []

        seen: set[str] = set()

        def _add_name(raw) -> None:
            n = str(raw or "").strip()
            if not n or n.upper() in ("STAFF", "TBA") or n in seen:
                return
            seen.add(n)
            self._professor_names.append(n)
            self._by_norm_name[_norm(n)] = n
            parts = _norm(n).split()
            if parts:
                self._by_last.setdefault(parts[-1], []).append(n)

        # Authoritative list from instructors table, then grades, then current sections
        if instructors_df is not None and not instructors_df.empty and "name" in instructors_df.columns:
            for name in instructors_df["name"].dropna().unique():
                _add_name(name)
        if grades_df is not None and not grades_df.empty and "Instructor" in grades_df.columns:
            for name in grades_df["Instructor"].dropna().unique():
                _add_name(name)
        if sections_df is not None and not sections_df.empty and "instructor" in sections_df.columns:
            for name in sections_df["instructor"].dropna().unique():
                _add_name(name)

        self._last_names = list(self._by_last.keys())

        def _add_course(subj, num, title="") -> None:
            s, n = str(subj or "").strip().upper(), str(num or "").strip()
            if not s or not n:
                return
            self._course_codes.add((s, n))
            self._known_subjects.add(s)
            t = _norm(title)
            if t and t not in self._title_to_code:
                self._title_to_code[t] = (s, n)
                self._titles.append(t)

        if grades_df is not None and not grades_df.empty and "Subject" in grades_df.columns:
            cols = ["Subject", "Course No."] + (["Course Title"] if "Course Title" in grades_df.columns else [])
            for row in grades_df[cols].drop_duplicates().itertuples(index=False):
                _add_course(row[0], row[1], row[2] if len(row) > 2 else "")
            if "Instructor" in grades_df.columns:
                for rec in grades_df[["Subject", "Course No.", "Instructor"]].dropna().to_dict("records"):
                    key = (str(rec.get("Subject")).strip().upper(), str(rec.get("Course No.")).strip())
                    inst = str(rec.get("Instructor") or "").strip()
                    if key[0] and key[1] and inst:
                        self._course_instructors.setdefault(key, set()).add(inst)
        if courses_df is not None and not courses_df.empty:
            for rec in courses_df.to_dict("records"):
                _add_course(rec.get("subject"), rec.get("course_number"), rec.get("title") or "")

        logger.info(
            "[entity_resolver] Ready — %d instructors, %d course codes, %d titles (rapidfuzz=%s)",
            len(self._professor_names), len(self._course_codes), len(self._titles), _HAS_RAPIDFUZZ,
        )

    # ── Professors ─────────────────────────────────────────────────────────────

    def surname_candidates(self, name: str) -> list[str]:
        """Return verified instructors sharing a bare surname."""
        parts = _norm(name or "").split()
        if len(parts) != 1:
            return []
        return list(self._by_last.get(parts[0], []))

    def resolve_professor_ex(self, name: str) -> ResolvedEntity:
        """Structured professor resolution: exact → last-name → fuzzy."""
        if not name or not self._professor_names:
            return ResolvedEntity(value=name or None, confidence=0.0)

        raw = name.strip()
        nname = _norm(raw)
        if nname in _NON_PERSON_TOKENS:
            return ResolvedEntity(value=raw, confidence=0.0)

        parts = nname.split()
        last = parts[-1] if parts else nname

        # 1. Exact normalized full-name match
        exact = self._by_norm_name.get(nname)
        if exact:
            # A single-token exact match (a bare last name like "Smith", which
            # shows up in the data as a raw/incomplete instructor record) can
            # silently outrank real, distinct instructors who share that
            # surname ("Michael Smith", "Perez Smith") — verified live this
            # let a genuinely ambiguous "Professor Smith" query resolve with
            # full confidence to the bare-surname artifact instead of asking
            # for clarification. Treat it as ambiguous when siblings exist.
            if len(parts) == 1:
                siblings = [o for o in self._by_last.get(last, []) if o != exact]
                if siblings:
                    candidates = [exact] + siblings
                    return ResolvedEntity(
                        value=exact, confidence=0.6, candidates=candidates, ambiguous=True,
                        warning=f"Multiple instructors share the last name '{raw}': "
                                + ", ".join(candidates[:4]),
                    )
            return ResolvedEntity(value=exact, confidence=1.0)

        # 2. Last-name dict lookup (handles "Hamouda" → "Mohammed Hamouda")
        owners = self._by_last.get(last, [])
        if len(owners) == 1:
            return ResolvedEntity(value=owners[0], confidence=0.95)
        if len(owners) > 1:
            # Ambiguous last name — try to narrow using any earlier name parts
            if len(parts) > 1:
                for cand in owners:
                    if all(p in _norm(cand) for p in parts):
                        return ResolvedEntity(value=cand, confidence=0.9, candidates=owners)
            return ResolvedEntity(
                value=owners[0], confidence=0.6, candidates=owners, ambiguous=True,
                warning=f"Multiple instructors share the last name '{raw}': "
                        + ", ".join(owners[:4]),
            )

        # 3. Fuzzy match on last names (typos)
        hits = _best_matches(last, self._last_names, limit=3)
        if hits and hits[0][1] >= _PROF_CUTOFF:
            matched_last, score = hits[0]
            owners = self._by_last.get(matched_last, [])
            if owners:
                if len(owners) > 1:
                    return ResolvedEntity(
                        value=owners[0], confidence=score * 0.8, candidates=owners,
                        ambiguous=True,
                        warning=f"Assuming you meant '{owners[0]}' — others match too: "
                                + ", ".join(owners[1:4]),
                    )
                if owners[0] != raw:
                    logger.info("[entity_resolver] Professor %r → %r (fuzzy %.2f)", raw, owners[0], score)
                return ResolvedEntity(value=owners[0], confidence=score, candidates=owners)

        # 4. DB fallback — pg_trgm similarity search via idx_instructors_name_trgm.
        # Catches typos too far off for the in-memory last-name fuzzy match
        # (tier 3) to clear _PROF_CUTOFF.
        best_python_score = hits[0][1] if hits else 0.0
        if best_python_score < 0.6:
            db_hit = self._resolve_via_db_trgm(raw)
            if db_hit and db_hit.confidence > best_python_score:
                return db_hit

        return ResolvedEntity(
            value=raw, confidence=0.0,
            warning=f"No instructor matching '{raw}' found in the database.",
        )

    def _resolve_via_db_trgm(self, raw: str) -> "ResolvedEntity | None":
        """DB-side fallback using the search_instructors_trgm RPC (pg_trgm
        similarity() over idx_instructors_name_trgm). Returns None on any
        failure or when nothing clears the 0.3 similarity floor."""
        if self._supabase is None:
            return None
        try:
            rows = self._supabase.rpc("search_instructors_trgm", {"query": raw}).execute().data or []
        except Exception as exc:
            logger.debug("[entity_resolver] DB trgm fallback failed for %r: %s", raw, exc)
            return None
        if not rows:
            return None
        top = rows[0]
        name, sim = top.get("name"), top.get("sim")
        if not name or sim is None or sim <= 0.3:
            return None
        logger.info("[entity_resolver] Professor %r → %r (db trgm %.2f)", raw, name, sim)
        return ResolvedEntity(value=name, confidence=float(sim))

    def resolve_professor(self, name: str) -> str:
        """Back-compat string API: returns the corrected name or the original."""
        res = self.resolve_professor_ex(name)
        return res.value if res.value and res.confidence >= _PROF_CUTOFF * 0.8 else name

    def resolve_professors_for_course(self, name: str, subject: str | None, course_no: str | None) -> ResolvedEntity:
        """Resolve a professor and verify association with the requested course."""
        resolved = self.resolve_professor_ex(name)
        if resolved.ambiguous:
            resolved.warning = resolved.warning or "ambiguous_professor"
            return resolved
        if not resolved.value or resolved.confidence < 0.6:
            return ResolvedEntity(value=None, confidence=0.0, warning="unknown_professor", status="unknown_professor")
        if subject and course_no:
            key = (str(subject).strip().upper(), str(course_no).strip())
            instructors = self._course_instructors.get(key, set())
            if instructors and resolved.value not in instructors:
                return ResolvedEntity(
                    value=resolved.value,
                    confidence=resolved.confidence,
                    candidates=sorted(instructors)[:8],
                    warning="professor_course_mismatch",
                    status="professor_course_mismatch",
                )
        return resolved

    # ── Courses ────────────────────────────────────────────────────────────────

    def resolve_course_ref(self, text: str) -> ResolvedEntity:
        """
        Resolve a free-form course reference to 'SUBJ NUM'.
        Accepts 'CS 1114', 'cs1114', 'CS-1114', 'computer science 1114', and
        course titles ('intro to software design').
        """
        if not text:
            return ResolvedEntity(confidence=0.0)
        t = str(text).strip()

        # Code formats: CS 1114 / cs1114 / CS-1114
        m = re.search(r"\b([A-Za-z]{2,5})[\s-]*(\d{4})\b", t)
        if m:
            subj, num = m.group(1).upper(), m.group(2)
            if (subj, num) in self._course_codes:
                return ResolvedEntity(value=f"{subj} {num}", confidence=1.0)
            # Unknown subject code — maybe an alias or typo of a known subject
            fixed = self._fix_subject(subj)
            if fixed and (fixed, num) in self._course_codes:
                return ResolvedEntity(value=f"{fixed} {num}", confidence=0.9)
            return ResolvedEntity(
                value=f"{subj} {num}", confidence=0.3,
                warning=f"'{subj} {num}' is not in the VT catalog data.",
            )

        # Subject-name + number: "computer science 1114"
        norm_t = _norm(t)
        for alias, code in SUBJECT_ALIASES.items():
            m = re.search(rf"\b{re.escape(alias)}\s+(\d{{4}})\b", norm_t)
            if m and (code, m.group(1)) in self._course_codes:
                return ResolvedEntity(value=f"{code} {m.group(1)}", confidence=0.95)

        # Course-title fuzzy match
        if self._titles:
            hits = _best_matches(norm_t, self._titles, limit=3)
            if hits and hits[0][1] >= _TITLE_CUTOFF:
                title, score = hits[0]
                subj, num = self._title_to_code[title]
                cands = [f"{self._title_to_code[h][0]} {self._title_to_code[h][1]}" for h, _ in hits]
                return ResolvedEntity(value=f"{subj} {num}", confidence=score, candidates=cands)

        return ResolvedEntity(confidence=0.0)

    def resolve_course_references(self, text: str, default_subject: str | None = None) -> list[CourseResolution]:
        """Deterministically parse and validate all explicit course references in text.

        This is intentionally pattern/catalog based. Vector similarity is not a
        resolver for explicit course codes.
        """
        if not text:
            return []
        raw = str(text)
        default = self._infer_default_subject(raw, default_subject)
        explicit_spans: list[tuple[int, int]] = []
        out: list[CourseResolution] = []
        approved: set[tuple[str, str]] = set()
        rejected: set[tuple[str, str]] = set()
        last_subject: str | None = default

        def add(raw_text: str, subj: str, num: str, start: int, end: int, bare: bool = False) -> None:
            nonlocal last_subject
            subj = str(subj or "").strip().upper()
            num = str(num or "").strip()
            fixed = self._fix_subject(subj) if subj not in self._known_subjects else subj
            if fixed:
                subj = fixed
            code = (subj, num)
            normalized = f"{subj} {num}".strip()
            reason = self._course_rejection_reason(raw, start, end)
            if reason:
                if code not in rejected:
                    out.append(CourseResolution(raw_text, normalized, subj, num, "rejected", 1.0, reason=reason))
                    rejected.add(code)
                return
            status = "resolved" if code in self._course_codes else "unknown"
            confidence = 1.0 if status == "resolved" else 0.3
            if status == "resolved":
                last_subject = subj
                if code in approved:
                    return
                approved.add(code)
            out.append(CourseResolution(raw_text, normalized, subj, num, status, confidence))

        for match in re.finditer(r"\b([A-Za-z]{2,5})[\s-]*(\d{4})\b(?![-\s]?level)", raw):
            subj, num = match.group(1), match.group(2)
            if subj.lower() in {"and", "for", "not"}:
                continue
            explicit_spans.append(match.span())
            add(match.group(0), subj, num, match.start(), match.end())

        for match in re.finditer(r"\b(\d{4})\b(?![-\s]?level)", raw):
            start, end = match.span()
            if any(s <= start and end <= e for s, e in explicit_spans):
                continue
            num = match.group(1)
            if 2017 <= int(num) <= 2035:
                continue
            subj = last_subject or default
            if not subj:
                continue
            add(match.group(0), subj, num, start, end, bare=True)

        return out

    def resolve_course_code(self, subject: str, course_no: str) -> tuple[str, str]:
        """Back-compat API: normalize and validate; never fabricates codes."""
        if not subject or not course_no:
            return subject, course_no
        subj = subject.strip().upper()
        num = str(course_no).strip()
        if (subj, num) in self._course_codes:
            return subj, num
        fixed = self._fix_subject(subj)
        if fixed and (fixed, num) in self._course_codes:
            logger.info("[entity_resolver] Subject %r → %r", subj, fixed)
            return fixed, num
        logger.debug("[entity_resolver] Course %r %r not in catalog — keeping as-is", subj, num)
        return subj, num

    def course_exists(self, subject: str, course_no: str) -> bool:
        return (str(subject or "").strip().upper(), str(course_no or "").strip()) in self._course_codes

    def _fix_subject(self, subj: str) -> str | None:
        """Alias lookup, then fuzzy against known subject codes."""
        alias = SUBJECT_ALIASES.get(subj.lower())
        if alias:
            return alias
        hits = _best_matches(subj, list(self._known_subjects), limit=1)
        if hits and hits[0][1] >= 0.8:
            return hits[0][0]
        return None

    def _infer_default_subject(self, text: str, explicit_default: str | None = None) -> str | None:
        if explicit_default:
            return str(explicit_default).strip().upper()
        norm = _norm(text)
        for alias, code in SUBJECT_ALIASES.items():
            if re.search(rf"\b{re.escape(alias)}\b", norm):
                return code
        if re.search(r"\bcs\b|\bcomputer science\b", norm):
            return "CS"
        return None

    def _course_rejection_reason(self, text: str, start: int, end: int) -> str | None:
        sentence_start = max(text.rfind(".", 0, start), text.rfind("?", 0, start), text.rfind("!", 0, start)) + 1
        before = text[sentence_start:start].lower()
        local = text[max(0, start - 40):end].lower()
        if re.search(r"\bnot\s+$", before) or re.search(r"\bnot\s+[a-z]{2,5}\s*-?\s*\d{4}", local):
            return "injected_entity_rejected"
        if "pretend" in before or "instead of" in before or "rather than" in before:
            return "injected_entity_rejected"
        return None

    # ── Free-text scan (back-compat) ──────────────────────────────────────────

    _STOPWORDS = {
        "which", "what", "who", "how", "the", "for", "in", "is", "are",
        "best", "worst", "good", "bad", "hard", "easy", "this", "that",
        "grade", "grades", "class", "course", "courses", "gpa", "rate",
        "prof", "professor", "instructor", "cs", "ece", "math", "take",
        "hardest", "easiest", "toughest", "harder", "easier", "tougher",
        "better", "worse", "brutal", "difficult", "top", "great",
        "terrible", "awful", "strongest", "weakest", "teaching", "teaches",
        "semester", "fall", "spring", "should", "schedule", "classes",
        "homework", "workload", "work", "least", "most", "gives", "give",
        "assigns", "assignment", "assignments",
    }

    def resolve_question_entities(self, question: str) -> tuple[str | None, str | None]:
        """
        Scan free text for an inline professor name when the planner didn't
        extract one. Returns (resolved_professor_name, None) or (None, None).
        """
        tokens = re.findall(r"\b[A-Za-z]{3,}\b", question)
        for token in tokens:
            if token.lower() in self._STOPWORDS:
                continue
            owners = self._by_last.get(token.lower())
            if owners:
                return owners[0], None
            res = self.resolve_professor_ex(token)
            if res.value and res.confidence >= _PROF_CUTOFF and res.value.lower() != token.lower():
                return res.value, None
        return None, None
