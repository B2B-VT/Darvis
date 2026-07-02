import re
import logging
import pandas as pd
from app.features.templated_answers import general_answer

logger = logging.getLogger("darvis")

_SCHEDULE_RMP_PATTERNS = [
    "rmp", "rate my professor", "rating", "score", "rated",
    "professors you", "instructors you", "teachers you",
    "professors in", "those professors", "each professor",
]

def _last_name(name: str) -> str:
    parts = (name or "").strip().split()
    return parts[-1].lower() if parts else ""


def _try_schedule_rmp_answer(question: str, history: list | None, rmp_df=None) -> str | None:
    """
    If asking about RMP scores for the schedule just built, answer from the
    startup-loaded instructors DataFrame directly instead of letting the LLM
    claim the schedule was fabricated.
    """
    if not history:
        return None
    q = question.lower()
    if not any(pat in q for pat in _SCHEDULE_RMP_PATTERNS):
        return None

    # Find the last schedule-builder assistant message
    schedule_msg = None
    for msg in reversed(history):
        if msg.get("role") == "assistant":
            content = msg.get("content", "")
            if "Schedule tab" in content or "schedule tab" in content:
                schedule_msg = content
                break
    if not schedule_msg:
        return None

    # Extract instructor names from "(HH:MM AM/PM–HH:MM AM/PM, InstructorName)"
    instructor_names = re.findall(
        r"\d+:\d+\s*(?:AM|PM)[^,)]*,\s*([A-Z][A-Za-z\s\.]+?)\)",
        schedule_msg,
    )
    instructor_names = [n.strip() for n in instructor_names if n.strip()]
    if not instructor_names:
        return None

    if rmp_df is None or rmp_df.empty:
        return None

    try:
        # Startup-loaded instructors DataFrame — a live Supabase read here would
        # be capped at 1,000 of the 3,800+ instructors by PostgREST.
        rmp_by_last: dict[str, dict] = {}
        for _, row in rmp_df.iterrows():
            ln = _last_name(str(row.get("name") or ""))
            if ln and ln not in rmp_by_last:
                rmp_by_last[ln] = row

        parts: list[str] = []
        no_data: list[str] = []
        for name in instructor_names:
            row = rmp_by_last.get(_last_name(name))
            if row is not None and pd.notna(row.get("rmp_rating")):
                rating = float(row["rmp_rating"])
                count  = row.get("rmp_count") or 0
                diff   = row.get("rmp_difficulty")
                diff_str = f", difficulty {float(diff):.1f}" if pd.notna(diff) else ""
                parts.append(f"{name}: {rating:.1f}/5 ({count} reviews{diff_str})")
            else:
                no_data.append(name)

        if not parts and no_data:
            return (
                f"None of the selected professors ({', '.join(no_data)}) "
                "have RMP data in our database yet."
            )

        lines = ["Here are the RMP scores for the professors I selected:"] + [f"  {p}" for p in parts]
        if no_data:
            lines.append(f"No RMP data on file for: {', '.join(no_data)}.")
        return " ".join(lines)

    except Exception as e:
        logger.warning("[general_chat] schedule RMP lookup failed: %s", e)
        return None


def handle_general_chat(question: str, df: pd.DataFrame, llm, vector_store, intent=None, history=None, user_profile=None, rmp_df=None):
    """
    Catch-all for general_rag route — RAG context + LLM answer, no analytics table.
    Schedule RMP follow-ups are answered directly from loaded data to prevent LLM hallucination.
    """
    # Intercept "tell me the RMP scores of the professors you picked" before LLM
    schedule_answer = _try_schedule_rmp_answer(question, history, rmp_df=rmp_df)
    if schedule_answer:
        return schedule_answer, [], [], {}

    retrieved = vector_store.query(question, n_results=6)
    from app.rag.prompts import build_rag_only_prompt
    if retrieved:
        prompt = build_rag_only_prompt(question, retrieved, intent=intent)
    else:
        prompt = (
            "You are a VT academic advisor. Answer this student's question using general "
            "knowledge about Virginia Tech. Do NOT state specific GPA averages, grade "
            "distributions, pass rates, A rates, F rates, or enrollment numbers — you have "
            "no grade data for this question and must not invent statistics.\n\n"
            f"Student's question: {question}"
        )

    if user_profile:
        parts = []
        if user_profile.get("major"):
            parts.append(f"Major: {user_profile['major']}")
        if user_profile.get("minor"):
            parts.append(f"Minor: {user_profile['minor']}")
        if user_profile.get("interests"):
            parts.append(f"Interests: {', '.join(user_profile['interests'])}")
        if user_profile.get("coursesTaken"):
            parts.append(f"Courses taken: {', '.join(user_profile['coursesTaken'])}")
        if parts:
            prompt += f"\n\nStudent profile: {' | '.join(parts)}"

    answer = llm.answer(prompt, history=history) or general_answer(question)
    return answer, [], [], {}
