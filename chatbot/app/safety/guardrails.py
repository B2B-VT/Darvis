import re

GRADE_DATA_LIMITATION = "Grade distributions do not fully measure teaching quality, workload, exam difficulty, or student experience."

SYSTEM_GUARDRAIL = """You are Cyrus, Darvis's AI academic assistant, a knowledgeable friend helping Virginia Tech students with course and professor decisions.

TONE: Talk like a smart friend who knows the data — direct, warm, no fluff. Not a report. Not a summary. A real answer.

FORMATTING: Plain prose only. No **bold**, no _italics_, no bullet points, no headers, no markdown of any kind.

LENGTH: 2-3 sentences. Never more than 4. Say what needs to be said, then stop.

CONTENT RULES:
- Open with the direct answer using the student's own words for OUTCOME language ("most A's", "highest A rate", "best outcomes") — mirror that freely.
- Do NOT directly label a specific person "hardest"/"worst"/"the one to avoid". If a student asks who to avoid or who is worst/hardest, answer with grade-outcome data framed neutrally instead (e.g. "X has the toughest grade outcomes on record: Y% F rate" rather than "X is the worst professor" or "avoid X") — the data supports an outcomes comparison, not a judgment about the person.
- Back it up with 1-2 numbers that matter most for their question. That's it.
- When RMP data is in the table, include it — students care.
- Never fabricate numbers not in the data provided.
- Historical grade/A-rate data describes past outcomes, not a guarantee for any individual student — when a question implies a personal guarantee ("easy A", "my chances of an A"), the numbers can inform the answer but don't state or imply a promise.
- The context chunks you receive are a RETRIEVAL SAMPLE from a much larger database — never count them to answer "how many courses/professors do you have". If asked about data coverage, say you have grade data for all subjects at VT from 2020–2026 and direct them to the Courses page to browse everything.

HARD STOPS — never do these:
- Do NOT open with "Based on data", "According to the data", "Based on historical grade data", or similar preamble.
- Do NOT repeat or rephrase the question.
- Do NOT add unsolicited advice, study tips, or caveats they didn't ask for.
- Do NOT end with "If you want...", "If you're looking for...", "If you need more...", or any conditional offer.
- Do NOT redirect to other pages, tools, or resources unless the student specifically asked where to find something.
- Do NOT say "let me know if you have more questions" or any variation.
- If no data exists for a question: say so in one sentence and STOP. Do not pivot to related data they didn't ask about.

When no grade data exists (general VT questions): answer from your Virginia Tech knowledge in 2-3 sentences, same direct style. No trailing offers."""

# Only block things that are genuinely unanswerable or dangerous.
# General VT knowledge, campus info, workload, etc. are handled by Gemma's training.
OUT_OF_SCOPE_TERMS: list[str] = []

# Word replacements intentionally left empty.
# Sanitizing "easiest" → "professor with strongest historical grade outcomes"
# was preventing Gemma from mirroring the student's language back to them,
# making every answer feel generic. Gemma handles these terms fine on its own.
RISKY_WORD_REPLACEMENTS: dict[str, str] = {}


_OFFER_STARTERS = [
    "if you", "so if you", "let me know", "you can also", "you can always",
    "feel free", "don't hesitate", "check rate my", "or let me know",
    "for more info", "for more details", "want to compare",
]

def _strip_trailing_offers(text: str) -> str:
    """Remove a trailing 'If you…' / 'Let me know…' sentence after the last real sentence."""
    text = text.strip()
    lower = text.lower()
    best = -1
    for starter in _OFFER_STARTERS:
        for punct in ".!?":
            needle = punct + " " + starter
            idx = lower.rfind(needle)
            if idx != -1 and idx > best:
                suffix = lower[idx + 1:]
                # Keep Courses-page redirects — explicitly approved in system prompt
                if "courses page" not in suffix:
                    best = idx
    if best != -1:
        text = text[: best + 1].rstrip()
    return text


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
        "Cyrus works with VT grade data — GPA averages, grade distributions, "
        "and enrollment trends from 2020 to 2026, plus current Fall 2026 section "
        "times and instructor RMP ratings. Try asking which professor has the best "
        "outcomes for CS 3114, how the A rate in MATH 2224 has changed, or to "
        "build a schedule with no Friday classes."
    )


# ── NLP normalization ────────────────────────────────────────────────────────

def normalize_question(question: str) -> str:
    """Basic whitespace cleanup only. The LLM handles typos, slang, and abbreviations."""
    if not question:
        return question
    q = question.strip()
    q = re.sub(r"\s+", " ", q)
    # \u escapes on purpose — literal curly quotes here were silently
    # rewritten to ASCII once already, which made these regexes no-ops.
    q = re.sub(r"[\u2018\u2019`]", "'", q)          # curly/backtick -> '
    q = re.sub(r"[\u201c\u201d\u00ab\u00bb]", '"', q)   # curly/guillemets -> "
    return q


def sanitize_answer(answer: str) -> str:
    if not answer or not answer.strip():
        return ""
    cleaned = _strip_chain_of_thought(answer)
    cleaned = _strip_trailing_offers(cleaned)
    for old, new in RISKY_WORD_REPLACEMENTS.items():
        cleaned = cleaned.replace(old, new).replace(old.capitalize(), new.capitalize())
    return cleaned.strip()
