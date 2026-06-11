import re
import difflib

GRADE_DATA_LIMITATION = "Grade distributions do not fully measure teaching quality, workload, exam difficulty, or student experience."

SYSTEM_GUARDRAIL = """You are Darvis, an assistant for Virginia Tech students.

CORE RULE: Mirror the student's exact question in your answer. If they asked "who is the easiest professor", your answer should say "the easiest professor is X". If they asked "who should I avoid", tell them who to avoid and why. If they asked for both grade data and RMP, give both. Never give a generic answer that would fit any question about the same course.

When grade data is provided:
- Open with the direct answer to what they specifically asked. Use their own words back at them.
- Support the answer with 2-3 numbers that are most relevant to their question. For "easiest" questions, lead with A rate and RMP difficulty. For "best outcomes" questions, lead with GPA and A rate. For "hardest/avoid" questions, lead with F rate and low GPA.
- When RMP data is in the table, always include it — it matters to students.
- Write 2-4 sentences in plain, direct language. No bullet points.
- Do not open with "Based on historical grade data", "According to the data", or any similar preamble.
- End with one brief sentence about grade data limitations only when you're making a strong recommendation.

When no grade data is provided (general VT questions):
- Answer from your knowledge of Virginia Tech. Be direct and helpful.
- Keep it to 2-5 sentences.

When the data doesn't fully answer the question:
- Say so in one sentence, then give the best answer you can from general VT knowledge.
- Never fabricate numbers you were not given.

Always: Start with the answer immediately. No preamble. No repeating the question. Warm, direct language."""

# Only block things that are genuinely unanswerable or dangerous.
# General VT knowledge, campus info, workload, etc. are handled by Gemma's training.
OUT_OF_SCOPE_TERMS: list[str] = []

# Word replacements intentionally left empty.
# Sanitizing "easiest" → "professor with strongest historical grade outcomes"
# was preventing Gemma from mirroring the student's language back to them,
# making every answer feel generic. Gemma handles these terms fine on its own.
RISKY_WORD_REPLACEMENTS: dict[str, str] = {}


def _strip_chain_of_thought(text: str) -> str:
    """
    Gemma externalises reasoning as asterisk-bullet lines before the actual answer.
    Find the last such line and return everything after it.
    If no bullets are present, return the text unchanged.
    Also strips any quoted 'planned answer' block that Gemma sometimes outputs
    before writing the final prose.
    """
    lines = text.splitlines()

    # Find the index of the last line that looks like a reasoning bullet
    last_bullet = -1
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("* ") or stripped == "*":
            last_bullet = i

    if last_bullet != -1:
        tail = "\n".join(lines[last_bullet + 1:]).strip()
        if tail:
            text = tail

    # Strip any remaining leading quoted block (Gemma's "planned answer" before the real output).
    # MULTILINE makes ^ match each line start; [^\n"] excludes both quotes and newlines
    # so the pattern only matches single-line quoted strings.
    text = re.sub(r'^"[^\n"]{20,}"\s*\n?', "", text, flags=re.MULTILINE).strip()

    return text


def default_warnings() -> list[str]:
    return [
        GRADE_DATA_LIMITATION,
        "Recommendations are based on historical grade data only.",
    ]


def is_out_of_scope(question: str) -> bool:
    q = question.lower()
    return any(term in q for term in OUT_OF_SCOPE_TERMS)


def out_of_scope_response() -> str:
    return (
        "I can only work with historical grade distributions — GPA, A/A- rates, F rates, "
        "withdrawals, enrollment counts, and how those numbers trend over time. I can't speak "
        "to teaching style, workload, exam difficulty, curves, or attendance policies.\n\n"
        "Here are questions I can answer:\n"
        "- Which instructor for this course has the strongest historical grade outcomes?\n"
        "- How has the A rate in this course changed over recent semesters?\n"
        "- Which sections of this course have the highest F or withdrawal rates?\n\n"
        "For student experiences and opinions beyond the numbers, check the Forums page. "
        "For more on how this tool works, see the FAQs page."
    )


# ── NLP normalization helpers ─────────────────────────────────────────────────

# All known VT subject codes — used for fuzzy-matching garbled dept names.
_VT_SUBJECTS = {
    "CS", "ECE", "MATH", "STAT", "PHYS", "CHEM", "BIOL", "ENGL", "HIST",
    "POLS", "PSYC", "SOC", "ECON", "FIN", "MGT", "MKTG", "ACIS", "BIT",
    "ME", "AOE", "CEE", "MSE", "ISE", "BME", "CHE", "BSE", "ESM", "GEOS",
    "AAEC", "APSC", "HORT", "PPWS", "HNFE", "NSCI", "HD", "NTR",
    "ARCH", "BLD", "LARC", "UAPP", "ART", "THEA", "MUS", "COMM",
    "PHIL", "REL", "CNST", "SPAN", "FREC", "SPIA", "PAPA",
}

# Curated typo dictionary — catches the most common mis-keyings without
# a full spell-check library (which would add a dependency and latency).
_TYPO_MAP: dict[str, str] = {
    # question words
    "wich": "which", "whcih": "which", "whihc": "which",
    "wwich": "which", "wihch": "which",
    "waht": "what", "wath": "what", "whats": "what",
    "hwo": "who", "woh": "who", "hwo": "how",
    # common small words
    "teh": "the", "hte": "the", "tthe": "the",
    "taht": "that", "tath": "that",
    "fo": "for", "fro": "for",
    "ot": "to", "tio": "to",
    "nad": "and", "adn": "and",
    # course / academic words
    "coarses": "courses", "couses": "courses", "coures": "courses", "coruses": "courses",
    "clases": "classes", "clasess": "classes",
    "reqirements": "requirements", "requirments": "requirements",
    "requiremnts": "requirements", "requrements": "requirements",
    "requirment": "requirement", "requiremnt": "requirement",
    "gradution": "graduation", "graduaton": "graduation", "graducation": "graduation",
    "syllbus": "syllabus", "slylabus": "syllabus",
    "prereq": "prerequisite", "prereqs": "prerequisites",
    "elecive": "elective", "elctive": "elective",
    "instrucor": "instructor", "instuctor": "instructor", "instructur": "instructor",
    "professer": "professor", "proffesor": "professor", "proffessor": "professor",
    "profssor": "professor", "proefssor": "professor",
    # action words
    "tought": "taught", "teches": "teaches", "teaach": "teach", "teahces": "teaches",
    "graudate": "graduate", "graducate": "graduate",
    "enrolment": "enrollment", "enroolment": "enrollment",
    # difficulty / quality words
    "hardist": "hardest", "harrdest": "hardest", "hardset": "hardest",
    "easist": "easiest", "eaisest": "easiest", "esaiest": "easiest", "easeist": "easiest",
    "diffucult": "difficult", "difficutl": "difficult", "difficlut": "difficult",
    # common word typos relevant to Darvis queries
    "computr": "computer", "compuer": "computer", "conputer": "computer",
    "scienc": "science", "sceince": "science",
    "gradse": "grades", "greades": "grades", "garde": "grade",
    "degre": "degree", "degreee": "degree",
    # outcome words
    "failuire": "failure", "failiure": "failure", "failuer": "failure",
    "withdrawl": "withdrawal", "withdawal": "withdrawal",
    "gpa": "gpa",  # already fine, but protect it from uppercasing oddly
    # VT-specific subject code typos / abbreviations
    "mth": "math", "mtah": "math", "matj": "math",
    "cse": "cs", "compsci": "cs",
    # Note: "EE" → "ECE" is handled by _SUBJECT_EXPANSIONS via word-boundary regex
    # slang / shorthand students actually type
    "reqs": "requirements", "req": "requirement",
    "profs": "professors",
    "ez": "easy", "tuff": "tough",
    "wat": "what", "wut": "what",
    "scheduel": "schedule", "schedual": "schedule", "shedule": "schedule",
    "calsses": "classes", "classs": "classes",
    "requitements": "requirements", "requierments": "requirements",
}

# Subject code expansions (single-word → canonical VT code, uppercase input expected).
_SUBJECT_EXPANSIONS: dict[str, str] = {
    "COMPSCI": "CS", "COMP": "CS", "CSE": "CS",
    "MTH": "MATH", "MATHMATICS": "MATH", "MATHEMATICS": "MATH",
    "CALC": "MATH",
    "EE": "ECE", "EECE": "ECE", "ELEC": "ECE",
    "MECH": "ME", "MECHENG": "ME",
    "STATS": "STAT", "STATISTICS": "STAT",
    "BIO": "BIOL", "BIOLOGY": "BIOL",
    "CHEM": "CHEM",  # already fine
    "PHYS": "PHYS",  # already fine
    "AERO": "AOE",
    "CIVIL": "CEE",
    "MATERIALS": "MSE",
    "INDUSTRIAL": "ISE",
    "BIOCHEM": "BCHS",
}


# Common English words that must never be fuzzy-matched to VT subject codes.
_COMMON_ENGLISH = {
    "the", "is", "in", "it", "at", "an", "as", "be", "by", "do", "go",
    "he", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us",
    "we", "hi", "ok", "oh", "am", "if", "id", "age", "are", "for",
    "and", "but", "not", "has", "had", "was", "did", "can", "get",
    "got", "put", "set", "ran", "run", "let", "say", "see", "sit",
    "all", "any", "few", "how", "old", "own", "who", "why", "yes",
    "you", "her", "him", "his", "its", "our", "out", "per", "too",
    "two", "via", "yet", "ago", "big", "bit", "due", "far", "low",
    "new", "now", "off", "use", "way", "add", "end", "lot", "top",
    "bad", "cut", "day", "fit", "hit", "key", "lay", "map", "pay",
    "red", "try", "win", "ask", "buy", "eat", "fly", "mix", "own",
}


def _fix_typos(text: str) -> str:
    """Word-by-word typo correction using _TYPO_MAP, then difflib fuzzy fallback
    for words that look like garbled VT subject codes.

    The fuzzy fallback only fires when ALL of the following are true:
    - The word is 3-5 characters long (2-char words cause too many false positives)
    - It is purely alphabetic
    - It is not a common English word
    - It is not already a known VT subject code
    - It was not already corrected by _TYPO_MAP
    """
    words = text.split()
    fixed = []
    for w in words:
        stripped = w.rstrip("?.,!;:")
        punct = w[len(stripped):]
        lower = stripped.lower()
        corrected = _TYPO_MAP.get(lower, lower)
        upper = lower.upper()
        # Only attempt fuzzy subject-code matching on plausible-but-unrecognised tokens
        if (
            corrected == lower           # _TYPO_MAP didn't already fix it
            and upper not in _VT_SUBJECTS
            and lower not in _COMMON_ENGLISH
            and 3 <= len(upper) <= 5
            and upper.isalpha()
        ):
            matches = difflib.get_close_matches(upper, _VT_SUBJECTS, n=1, cutoff=0.85)
            if matches:
                corrected = matches[0].lower()
        fixed.append(corrected + punct)
    return " ".join(fixed)


def normalize_question(question: str) -> str:
    """
    Light NLP normalization applied to every incoming question:
    1. Strip leading/trailing whitespace.
    2. Collapse multiple spaces into one.
    3. Fix common typos and misspellings.
    4. Expand subject code abbreviations (mth → math, cse → cs, etc.).
    5. Re-attach spaced course codes ("CS 3 1 1 4" stays broken, but
       "cs3114" → kept as-is; extract_course_parts already handles no-space).
    """
    if not question:
        return question

    # Basic cleanup
    q = question.strip()
    q = re.sub(r"\s+", " ", q)               # collapse whitespace
    q = re.sub(r"[''`]", "'", q)             # normalize smart quotes
    q = re.sub(r"[""«»]", '"', q)            # normalize smart double quotes

    # Fix word-level typos
    q = _fix_typos(q)

    # Expand subject abbreviations that appear as standalone tokens
    # (only when surrounded by word boundaries so "calc" in "calculus" stays)
    for abbr, expansion in _SUBJECT_EXPANSIONS.items():
        q = re.sub(rf"\b{re.escape(abbr)}\b", expansion, q, flags=re.IGNORECASE)

    return q


def sanitize_answer(answer: str) -> str:
    if not answer or not answer.strip():
        return ""
    cleaned = _strip_chain_of_thought(answer)
    for old, new in RISKY_WORD_REPLACEMENTS.items():
        cleaned = cleaned.replace(old, new).replace(old.capitalize(), new.capitalize())
    return cleaned.strip()
