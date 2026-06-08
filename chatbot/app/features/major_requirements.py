"""
Major Requirements handler.

Answers questions like:
  "What courses do I need for the CS major?"
  "Show me the requirements for Mechanical Engineering"
  "Which cs classes are necessary for graduation?"
"""

import difflib
import re
import pandas as pd
from app.utils.charts import table_spec
from app.config import get_settings


# Common abbreviations → full major name (lowercase for matching)
_ALIASES = {
    "cs": "computer science",
    "cpe": "computer engineering",
    "ece": "electrical and computer engineering",
    "ee": "electrical engineering",
    "me": "mechanical engineering",
    "bme": "biomedical engineering",
    "ce": "civil engineering",
    "aoe": "aerospace and ocean engineering",
    "che": "chemical engineering",
    "mse": "materials science and engineering",
    "ise": "industrial and systems engineering",
    "math": "mathematics",
    "stat": "statistics",
    "bio": "biological sciences",
    "chem": "chemistry",
    "phys": "physics",
    "econ": "economics",
    "psych": "psychology",
    "comm": "communication",
    "engl": "english",
    "hist": "history",
    "pols": "political science",
    "soc": "sociology",
    "fin": "finance",
    "mktg": "marketing",
    "mgmt": "management",
    "acct": "accounting",
    "ba": "business administration",
}

# Words to strip when extracting a major name from a question
_STOP = {
    "what", "which", "who", "how", "tell", "me", "about", "show", "is",
    "are", "the", "for", "a", "an", "in", "at", "of", "do", "i", "need",
    "courses", "course", "requirements", "requirement", "required", "needed",
    "degree", "major", "curriculum", "plan", "roadmap", "program", "list",
    "all", "my", "get", "give", "if", "to", "and", "or", "classes", "class",
    "necessary", "neccessary", "graduate", "graduation", "complete", "finish",
    "take", "must", "should", "have", "need",
}


def _extract_major_query(question: str) -> str:
    """
    Strip filler words to isolate the major name the user is asking about.
    Resolves common abbreviations like 'cs' → 'computer science'.
    """
    patterns = [
        r"requirements? for (?:the )?(.+?)(?:\?|$)",
        r"required for (?:the )?(.+?)(?:\?|$)",
        r"courses? (?:for|needed for|required for|necessary for) (?:the )?(.+?)(?:\?|$)",
        r"classes? (?:for|needed for|required for|necessary for) (?:the )?(.+?)(?:\?|$)",
        r"curriculum for (?:the )?(.+?)(?:\?|$)",
        r"roadmap for (?:the )?(.+?)(?:\?|$)",
        r"plan for (?:the )?(.+?)(?:\?|$)",
        r"(?:major|degree) (?:in|for) (?:the )?(.+?)(?:\?|$)",
        r"(?:graduate|graduation) (?:in|with|from) (?:the )?(.+?)(?:\?|$)",
    ]
    for pattern in patterns:
        m = re.search(pattern, question, flags=re.IGNORECASE)
        if m:
            raw = m.group(1).strip().rstrip("?.,!")
            raw = re.sub(r"\b(major|degree|program|curriculum)\b", "", raw, flags=re.IGNORECASE).strip()
            # Resolve abbreviation if the entire extracted string is one
            alias = _ALIASES.get(raw.lower())
            if alias:
                return alias
            return raw

    # Fallback: words left after stripping stop words
    words = [w.strip("?.,!").lower() for w in question.split()]
    filtered = [w for w in words if w not in _STOP and len(w) > 1]

    # Resolve single-word abbreviations (e.g. "cs")
    if len(filtered) == 1 and filtered[0] in _ALIASES:
        return _ALIASES[filtered[0]]

    # Resolve abbreviation tokens within multi-word result
    resolved = [_ALIASES.get(w, w) for w in filtered]
    return " ".join(resolved)


def _find_major(requirements_df: pd.DataFrame, query: str) -> pd.DataFrame | None:
    """
    Find the best-matching major in the requirements dataframe.
    Returns the subset of requirement rows for that major, or None.
    """
    if requirements_df is None or requirements_df.empty:
        return None

    query_lower = query.lower().strip()
    majors = requirements_df["major_name"].dropna().unique()

    # Exact match
    for m in majors:
        if m.lower() == query_lower:
            return requirements_df[requirements_df["major_name"] == m]

    # Substring match — query inside major name
    for m in majors:
        if query_lower in m.lower():
            return requirements_df[requirements_df["major_name"] == m]

    # Substring match — major name inside query (handles "computer science major")
    for m in majors:
        if m.lower() in query_lower:
            return requirements_df[requirements_df["major_name"] == m]

    # Partial word overlap — require a strict majority of query words to match
    # to avoid false positives like "Dairy Science" winning on "science" alone.
    query_words = set(query_lower.split())
    best_score, best_major = 0, None
    for m in majors:
        m_words = set(m.lower().split())
        score = len(query_words & m_words)
        if score > best_score:
            best_score, best_major = score, m
    # Only accept word-overlap match when it covers most of the query words
    min_overlap = max(1, len(query_words) - 1)
    if best_score >= min_overlap and best_major:
        return requirements_df[requirements_df["major_name"] == best_major]

    # Difflib fuzzy fallback — handles typos like "computr science" → "Computer Science"
    matches = difflib.get_close_matches(query_lower, [m.lower() for m in majors], n=1, cutoff=0.6)
    if matches:
        matched_lower = matches[0]
        for m in majors:
            if m.lower() == matched_lower:
                return requirements_df[requirements_df["major_name"] == m]

    return None


def handle_major_requirements(
    question: str,
    requirements_df: pd.DataFrame,
    llm,
    vector_store=None,
    intent=None,
) -> tuple[str, list, list, dict]:
    """
    Returns (answer, tables, charts, metadata).

    Strategy:
    1. Use LLM-extracted major_query from intent, or fall back to regex extraction.
    2. Look up requirements in the dataframe.
    3. If found, build structured context and return table.
    4. If not found, fall back to the vector store + LLM.
    """
    # Use LLM-extracted major name if available; much more reliable than regex
    if intent is not None and intent.major_query:
        query = intent.major_query
    else:
        query = _extract_major_query(question)
    subset = _find_major(requirements_df, query)

    # ── Path 1: Found structured requirements ────────────────────────────────
    if subset is not None and not subset.empty:
        major_name = subset["major_name"].iloc[0]
        college = subset["college"].iloc[0] if "college" in subset.columns else ""
        degree = subset["degree"].iloc[0] if "degree" in subset.columns else ""

        groups: dict[str, list[str]] = {}
        for _, row in subset.iterrows():
            rtype = row.get("requirement_type") or "Other"
            rgroup = row.get("requirement_group") or ""
            key = f"{rtype} — {rgroup}" if rgroup else rtype
            code = row.get("course_code", "")
            title = row.get("course_title", "")
            credits = row.get("credits_min")
            entry = code
            if title:
                entry += f": {title}"
            if credits:
                entry += f" ({credits} cr)"
            groups.setdefault(key, []).append(entry)

        # Return a direct structured answer — skip the LLM call on the structured
        # path. The LLM call was hitting Render's 30s request timeout for large
        # majors (CS has 10+ requirement groups). The table below has all the detail.
        group_summary = ", ".join(
            f"{g.split(' — ')[-1]} ({len(c)} courses)" for g, c in list(groups.items())[:5]
        )
        if len(groups) > 5:
            group_summary += f", and {len(groups) - 5} more groups"
        answer = (
            f"The {major_name} ({degree or 'B.S.'}) has {len(subset)} required courses "
            f"across {len(groups)} requirement groups: {group_summary}. "
            f"See the full list in the table below."
        )

        settings = get_settings()
        table_rows = subset[["course_code", "course_title", "requirement_type", "credits_min"]].copy()
        table_rows.columns = ["Course Code", "Title", "Requirement Type", "Credits"]
        # Use table_spec() helper which produces list[dict] rows, not list[list].
        # Previously used .values.tolist() which created list[list] and failed
        # Pydantic's TableSpec validation (rows: list[dict[str, Any]]).
        table_dict = table_spec(
            f"{major_name} Requirements",
            table_rows,
            list(table_rows.columns),
            settings.max_rows_to_llm,
        )
        return answer, [table_dict], [], {"route": "major_requirements", "matched_major": major_name}

    # ── Path 2: No structured match — use vector store + LLM ─────────────────
    if vector_store is not None:
        context = vector_store.query(question, n_results=8)
        if context:
            prompt = f"Context from VT catalog:\n{context}\n\nQuestion: {question}"
            answer = llm.answer(prompt) if llm else None
            if answer:
                return answer, [], [], {"route": "major_requirements", "matched_major": None}

    # ── Path 3: Nothing worked — answer from general LLM knowledge ───────────
    if llm:
        prompt = f"Question: {question}"
        answer = llm.answer(prompt)
        if answer:
            return answer, [], [], {"route": "major_requirements", "matched_major": None}

    return (
        "I don't have specific requirement data for that major. Try asking with the full major name, "
        "like \"Computer Science\" or \"Mechanical Engineering\".",
        [], [],
        {"route": "major_requirements", "matched_major": None},
    )
