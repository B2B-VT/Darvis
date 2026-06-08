"""
app/rag/prompts.py

Prompt construction for the RAG pipeline.

The key principle: the prompt must encode WHAT THE STUDENT SPECIFICALLY WANTS,
not just the data. Gemma needs to know the student's intent so it gives a
personalized answer to their exact question rather than a generic data summary
that would fit any question about the same course.

Structure of every prompt:
  1. Data (pre-aggregated analytics table + RAG context)
  2. Intent framing — what this student actually wants from the answer
  3. Explicit answer instruction — what kind of response will help them
  4. The verbatim student question (last, for maximum LLM attention)
"""

from __future__ import annotations
from app.safety.guardrails import SYSTEM_GUARDRAIL

SYSTEM_PROMPT = SYSTEM_GUARDRAIL


def _intent_framing(route: str, intent, original_question: str = "") -> str:
    """
    Build a framing block that tells Gemma what the student specifically wants
    AND what language they used — so the answer mirrors their words back.

    The original_question is passed in so we can reflect specific phrasing like
    "easiest", "avoid", "brutal", "best using RMP" directly into the instruction.
    """
    if intent is None:
        return ""

    sort_goal = getattr(intent, "sort_goal", "highest_gpa") or "highest_gpa"
    course_no = getattr(intent, "course_no", None)
    subject   = getattr(intent, "subject", None)
    prof_name = getattr(intent, "professor_name", None)
    wants_rmp = getattr(intent, "wants_rmp", False)

    course_label = f"{subject} {course_no}".strip() if subject and course_no else (course_no or "")
    q = original_question.lower()

    # Detect specific phrasing from the student's question so we can reflect it
    asked_easiest  = any(w in q for w in ["easiest", "easy", "best gpa", "high gpa", "pass"])
    asked_hardest  = any(w in q for w in ["hardest", "hard", "brutal", "tough", "avoid", "worst"])
    asked_rmp      = wants_rmp or any(w in q for w in ["rmp", "rate my professor", "rated", "rating"])
    asked_both     = asked_rmp and any(w in q for w in ["grade", "gpa", "both", "and"])
    asked_fail     = any(w in q for w in ["fail", "f rate", "failing"])

    if route == "course_profile":
        if asked_easiest:
            base = f"The student asked who is easiest for {course_label}. Answer using their word 'easiest' — name the professor directly and explain why they're the easiest (high A rate, high GPA, low difficulty if RMP available)."
        elif asked_hardest:
            base = (
                f"The student asked who is the HARDEST professor for {course_label}. "
                f"The professor listed FIRST in the table has the LOWEST GPA — that is the hardest one. "
                f"Use the student's word 'hardest' in your answer. Do NOT say 'top outcomes' or 'strongest outcomes' — "
                f"say why they are the hardest (low GPA, high F rate)."
            )
        elif asked_fail:
            base = f"The student is asking about failure rates in {course_label}. Give a direct answer about who has the highest/lowest F rate."
        elif asked_both:
            base = f"The student explicitly asked for BOTH grade data and RMP ratings for {course_label}. Combine both in your answer — don't just pick one."
        elif asked_rmp:
            base = f"The student asked about RMP ratings for {course_label}. Lead with the RMP score and also include grade outcomes."
        else:
            goal_framing = {
                "highest_gpa":  f"The student wants the best professor for {course_label} by grade outcomes.",
                "lowest_gpa":   f"The student wants to know who has the worst outcomes for {course_label}.",
                "highest_a_rate": f"The student wants the highest chance of getting an A in {course_label}.",
                "lowest_f_rate": f"The student wants the safest option for passing {course_label}.",
                "largest_sample": f"The student wants the most data-reliable professor for {course_label}.",
            }
            base = goal_framing.get(sort_goal, f"The student is asking about {course_label}.")
        return base

    elif route == "professor_profile":
        name = prof_name or "this professor"
        if asked_rmp:
            return f"The student asked about {name}'s RMP rating specifically. Lead with the rating and difficulty score, then add grade outcomes."
        if asked_easiest:
            return f"The student wants to know if {name} is easy. Answer directly using their word — is this professor easy based on the data? Give the key numbers that support it."
        if asked_hardest:
            return f"The student is asking if {name} is hard or brutal. Give an honest direct answer based on F rate, GPA, and RMP difficulty if available."
        return f"The student is asking specifically about {name}. Give them a direct characterization — what should a student expect from this professor? Use the numbers to support it, don't just list them."

    elif route == "natural_filter":
        if asked_easiest:
            return "The student is looking for the easiest classes or professors. Answer using the word 'easiest' — give a direct ranked answer naming them."
        if asked_hardest:
            return "The student wants to know which classes are the hardest or which to avoid. Be direct and honest — name them."
        if asked_fail:
            return "The student is asking about failure rates. Name the specific courses/professors with the relevant F rate data."
        goal_framing = {
            "highest_gpa":    "The student wants the highest-GPA courses or professors. Give a direct ranked answer.",
            "highest_a_rate": "The student wants to maximize their chance of getting an A. Give a direct answer with the top options.",
            "most_withdraws": "The student is asking which courses people most often drop. Be direct and honest.",
            "largest_sample": "The student wants the most data-reliable results. Lead with sample size.",
        }
        return goal_framing.get(sort_goal, "Answer the student's question directly with a clear ranked answer.")

    elif route == "major_requirements":
        return "The student is asking about degree requirements. Give a direct answer — what they need and how it's organized."

    return ""


def _answer_instruction(route: str, intent) -> str:
    """
    Explicit closing instruction that tells Gemma HOW to respond.
    This prevents Gemma from defaulting to generic data narration.
    """
    sort_goal = getattr(intent, "sort_goal", None) if intent else None

    # For routes where the student needs a decision, be prescriptive
    if route == "course_profile":
        if sort_goal in ("lowest_gpa", "highest_f_rate", "most_withdraws"):
            return "Answer in 2-4 sentences. Lead with a clear, direct warning or identification by name. Support with the key numbers. Do not hedge or summarize all options equally."
        return "Answer in 2-4 sentences. Lead with a clear, direct recommendation by name. Support with the key numbers (GPA, A rate, sample size). Do not just describe the table."

    elif route == "professor_profile":
        return "Answer in 2-4 sentences. Give a direct characterization of this professor — what a student should expect. Weave in numbers naturally. Do not just list their stats."

    elif route == "natural_filter":
        return "Answer in 2-4 sentences. Lead with the direct answer to what they asked. Name specific courses or professors. Don't summarize the table."

    return "Answer the student's specific question directly in 2-4 sentences."


def build_answer_prompt(
    question: str,
    route: str,
    table_text: str,
    retrieved_context: str = "",
    intent=None,
) -> str:
    """
    Build the user-turn prompt for the LLM.

    The intent object is the key to personalization — it tells Gemma what the
    student specifically cares about so the answer addresses their actual question
    rather than generically describing the data.

    Args:
        question: The student's verbatim question (normalized).
        route: Routing decision — informs the answer instruction style.
        table_text: Pre-aggregated Pandas table as formatted string.
        retrieved_context: Semantic context from the RAG pipeline.
        intent: ChatIntent object — carries sort_goal, course, professor, etc.
    """
    parts: list[str] = []

    # 1. Data — primary structured analytics
    if table_text and table_text.strip():
        parts.append(f"Grade analysis data:\n{table_text.strip()}")

    # 2. Semantic context from RAG pipeline
    if retrieved_context and retrieved_context.strip():
        parts.append(f"Additional context from VT academic database:\n{retrieved_context.strip()}")

    # 3. Intent framing — what this student specifically wants, in their words
    framing = _intent_framing(route, intent, original_question=question)
    if framing:
        parts.append(f"Student context: {framing}")

    # 4. Answer instruction — how to respond (personalized, not generic)
    instruction = _answer_instruction(route, intent)
    parts.append(instruction)

    # 5. The verbatim question last (recency bias helps LLM attend to it)
    parts.append(f"Student's question: {question}")

    return "\n\n".join(parts)


def build_rag_only_prompt(question: str, retrieved_context: str, intent=None) -> str:
    """
    Simplified prompt for general_rag when there's no pre-aggregated table.
    """
    parts: list[str] = []

    if retrieved_context and retrieved_context.strip():
        parts.append(f"Context:\n{retrieved_context.strip()}")

    framing = _intent_framing("general_rag", intent)
    if framing:
        parts.append(f"Student context: {framing}")

    parts.append(f"Student's question: {question}")
    return "\n\n".join(parts)
