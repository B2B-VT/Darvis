import re
from app.data.analytics import extract_course_parts
from app.safety.guardrails import is_out_of_scope


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
    q = question.lower()

    if is_out_of_scope(question):
        return "out_of_scope"

    # Conversational follow-ups referencing a prior chatbot answer — route to
    # general_rag so the LLM can read the chat history and answer directly.
    _CONV_REF_PATTERNS = [
        "you just gave", "you gave me", "the classes you", "the courses you",
        "the schedule you", "you built", "you made for me", "you suggested",
        "those classes", "those courses", "in my schedule", "my schedule",
        "you selected", "you picked", "you chose", "you recommended",
        "the ones you", "you just made", "just gave me",
    ]
    if any(pat in q for pat in _CONV_REF_PATTERNS):
        return "general_rag"

    # Section lookup — "who is teaching X", "what times for X", "when does X teach Y"
    section_signals = [
        "who is teaching", "who's teaching", "who teaches",
        "what time does", "what times are", "what times is",
        "when does", "what days does",
        "teaching this semester", "teaching this fall", "teaching this upcoming",
        "teaching next semester", "teaching fall 2026",
        "of the professors teaching", "of professors teaching",
        "which professors are teaching", "what professors are teaching",
        "available this semester", "available this fall", "available fall 2026",
        "sections available", "section times", "class times for",
    ]
    if any(sig in q for sig in section_signals):
        return "section_lookup"

    # Major requirements — "what do I need for X major?", "CS requirements", etc.
    major_req_phrases = [
        "requirements for", "required for", "courses for", "courses needed for",
        "what do i need", "what courses do i need", "courses do i need",
        "curriculum for", "major requirements", "degree requirements",
        "what's required", "what is required", "plan for", "roadmap for",
        "need to graduate", "do i need to graduate", "need for my degree",
        "need for the degree", "to complete my degree", "for graduation",
        "graduate with", "needed to graduate", "classes do i need",
        # additional natural phrasings that were previously missed
        "required to graduate", "required for graduation", "classes required",
        "courses required", "to get my degree", "to finish my degree",
        "must take", "have to take", "need to take", "classes needed",
        "courses needed", "finish the major", "complete the major",
        "graduation requirements", "class requirements", "course requirements",
    ]
    if any(phrase in q for phrase in major_req_phrases):
        return "major_requirements"

    # Schedule builder — check early, before any other route
    schedule_signals = [
        "build me a schedule", "build a schedule", "make me a schedule",
        "make a schedule", "create a schedule", "create my schedule",
        "plan my schedule", "plan a schedule", "schedule for", "schedule me",
        "add to my schedule", "put in my schedule",
    ]
    if any(sig in q for sig in schedule_signals):
        return "schedule_builder"

    # Explicit professor profile requests — check BEFORE aggregate routing so
    # "courses taught by Hamouda" doesn't get swallowed by natural_filter.
    professor_phrases = [
        "professor profile", "profile for professor", "tell me about professor",
        "courses taught by", "classes taught by", "who is professor",
        "show me professor", "grades for professor",
        "taught by", "sections taught by",
    ]
    if any(phrase in q for phrase in professor_phrases):
        return "professor_profile"

    # RMP questions with a course number → always route to course_profile
    # so "which 2506 prof has the highest RMP?" doesn't get swallowed by natural_filter.
    if any(kw in q for kw in ["rate my professor", "rmp rating", "rmp score", "rmp"]):
        subject, course_no = extract_course_parts(question)
        if course_no:
            return "course_profile"
        return "professor_profile"

    # If a valid course number is present AND the question has ranking/comparison
    # language, route to course_profile — not natural_filter. This prevents
    # "Which CS 3114 professor has the highest GPA?" from landing in natural_filter.
    subject, course_no = extract_course_parts(question)
    if course_no:
        return "course_profile"

    # Aggregate / list-style questions
    natural_terms = [
        # listing / browsing
        "show me", "list ", "all courses", "all professors",
        "which class", "which classes", "which course", "which courses", "which professors",
        "what courses", "what classes", "what course", "what class", "what professors",
        "top courses", "top professors", "best courses", "best professors",
        # "which profs teach X" / "who teaches X" patterns
        "which profs", "which prof", "who teach", "who teaches", "profs teach",
        # outcome ranking signals (e.g. "strongest outcomes", "best results")
        "strongest", "weakest", "outcomes", "best outcomes", "worst outcomes",
        # levels & categories
        "elective", "electives",
        "1000-level", "2000-level", "3000-level", "4000-level",
        "1000 level", "2000 level", "3000 level", "4000 level",
        # F-rate / fail rate
        "fail rate", "failure rate", "f rate", "f-rate",
        "highest fail", "lowest fail", "most fail", "worst fail", "fewest fail",
        "highest f", "lowest f", "most f ", "worst f ",
        # GPA filters
        "highest gpa", "best gpa", "lowest gpa", "worst gpa", "hardest courses",
        # withdrawal filters
        "lowest withdrawal", "most withdrawal", "most withdraws",
        "highest withdrawal", "fewest withdrawal",
        # A-rate filters
        "highest a rate", "highest a ", "most a ",
        # size
        "most students", "largest class", "most data", "sample size", "reliable data",
        # comparison & trends
        "compare", " vs ", "versus", "trend", "over time",
        "how has", "changed", "recent semesters", "last few semesters",
        "improving", "worsening",
        # sizing constraints
        "at least", "minimum",
        # department-level
        "department", "courses in ", "professors in ",
        "has the highest", "has the lowest", "have the highest", "have the lowest",
        "with the highest", "with the lowest",
    ]
    if any(term in q for term in natural_terms):
        return "natural_filter"

    # RMP questions without a course number → professor profile
    if any(term in q for term in ["rate my professor", "rmp rating", "rmp score", "rmp"]):
        return "professor_profile"

    # Possessive/name patterns — "Hamouda's grades", "Shaffer's profile"
    # A capitalized name before profile/grades/courses/record → professor profile
    if re.search(r"[A-Z][a-z]{2,}(?:'s)?\s+(?:profile|grades|courses|classes|record|data)", question):
        return "professor_profile"

    # Professor-signal words without a specific course → professor profile
    # (catches "Shaffer grades", "Professor Richards record")
    if any(term in q for term in ["professor", "instructor", "prof ", "profs "]):
        return "professor_profile"

    return "general_rag"


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
