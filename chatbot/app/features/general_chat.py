import logging
import pandas as pd
from app.features.templated_answers import general_answer

logger = logging.getLogger("darvis")


def handle_general_chat(question: str, df: pd.DataFrame, llm, vector_store, intent=None, history=None, user_profile=None):
    """
    Catch-all for general_rag route — RAG context + LLM answer, no analytics table.
    Ranking/filter questions are routed to natural_filter.py by the intent extractor
    before reaching here, so running natural_filter again would produce false positives
    (all-CS table) for unrelated questions like "what is cs" or "who is the president".
    """
    retrieved = vector_store.query(question, n_results=6)
    from app.rag.prompts import build_rag_only_prompt
    prompt = build_rag_only_prompt(question, retrieved, intent=intent) if retrieved else f"Student's question: {question}"

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
