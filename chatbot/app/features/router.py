import re


def smart_display_n(question: str, default_top_n: int) -> int:
    """
    How many rows to show in the UI table based on question intent.
    The LLM still sees the full sorted result — this only trims the displayed table.
    """
    q = question.lower()

    # Explicit list intent → show everything
    if any(s in q for s in ["list ", "show all", "all professors", "all courses", "every professor"]):
        return default_top_n

    # Ranking / comparison intent → top 3 is enough
    ranking_signals = [
        "best", "worst", "highest", "lowest", "top", "which professor",
        "strongest", "weakest", "most ", "fewest", "compare", "rmp",
        "rate my professor", "who should", "who is the best",
    ]
    if any(s in q for s in ranking_signals):
        return 3

    # Specific professor lookup → 1 row
    if any(s in q for s in ["tell me about", "profile for", "courses taught by", "taught by"]):
        return 1

    return min(5, default_top_n)


def route_question(question: str) -> str:
    """Keyword routing has been removed — the LLM query planner
    (app/rag/query_planner.py) is the only routing logic. This function only
    still exists because a rare defensive path in main.py imports it when the
    planner itself failed to initialize; it must never silently guess a route."""
    raise NotImplementedError("Keyword routing removed. Use the LLM planner.")


def extract_professor_name_from_profile_question(question: str) -> str | None:
    """
    Pull a professor name out of a question. Tries explicit patterns first,
    then falls back to finding a capitalised word that isn't a stop word.
    Returns None when no plausible name can be extracted.
    """
    # Patterns that are safe to search case-insensitively — the captured groups
    # are always after explicit phrases, so the match is unambiguous.
    ci_patterns = [
        r"professor profile(?: for)?\s+(.+)$",
        r"profile for professor\s+(.+)$",
        r"tell me about professor\s+(.+)$",
        r"who is professor\s+(.+?)(?:\?|$)",
        r"courses taught by\s+(.+?)(?:\?|$)",
        r"classes taught by\s+(.+?)(?:\?|$)",
        r"grades for professor\s+(.+?)(?:\?|$)",
    ]
    for pattern in ci_patterns:
        m = re.search(pattern, question, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()

    # Patterns that capture a name — require the captured word to start with an
    # uppercase letter in the original question so we don't pick up common verbs
    # like "grades" from "professor grades easiest".
    name_patterns = [
        r"(?:professor|instructor|prof)\s+([A-Z][a-z]+)",
        r"([A-Z][a-z]{2,})(?:'s)?\s+(?:profile|grades|courses|classes|record|data)",
    ]
    for pattern in name_patterns:
        m = re.search(pattern, question)  # no IGNORECASE — requires true title case
        if m:
            return m.group(1).strip()

    # Fallback: first capitalised (mixed-case) word that isn't a common question word
    stop = {
        "who", "what", "which", "how", "tell", "me", "about", "show",
        "is", "are", "the", "for", "a", "an", "in", "at", "of",
        "any", "cs", "ece", "math", "give", "get",
    }
    for word in question.split():
        clean = word.strip("?.,!").lower()
        raw = word.strip("?.,!")
        if clean not in stop and raw and raw[0].isupper() and not raw.isupper():
            return raw

    return None
