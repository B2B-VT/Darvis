import logging
import pandas as pd
from app.data.analytics import natural_filter
from app.rag.prompts import build_answer_prompt
from app.utils.charts import table_spec
from app.config import get_settings
from app.features.templated_answers import filter_answer, general_answer

logger = logging.getLogger("darvis")

# Keywords that suggest the user is asking about actual grade data
_DATA_SIGNALS = {
    "gpa", "grade", "grades", "graded", "a rate", "f rate", "fail",
    "withdraw", "course", "courses", "class", "classes", "professor",
    "instructor", "enrollment", "students", "section", "sections",
    "distribution", "average", "median", "score", "scores", "data",
    "history", "historical", "semester", "term", "trend",
}

# Signals that override _DATA_SIGNALS — these are requirements/policy questions,
# not grade data queries. Never run natural_filter on these.
_REQUIREMENTS_SIGNALS = {
    "graduation", "graduate", "requirement", "requirements", "required",
    "necessary for", "need for", "need to", "curriculum", "degree plan",
    "what do i need", "courses do i need", "classes do i need",
    "to graduate", "for my degree", "major requires", "major needs",
}

FILTER_COLS = [
    "Course", "Instructor", "Course Title",
    "Avg GPA", "Avg A Range (%)", "Avg F Rate (%)",
    "Total Students", "Terms Taught", "Confidence Label",
]


def _looks_like_requirements_query(question: str) -> bool:
    q = question.lower()
    return any(sig in q for sig in _REQUIREMENTS_SIGNALS)


def _looks_like_data_query(question: str) -> bool:
    q = question.lower()
    return any(sig in q for sig in _DATA_SIGNALS) and not _looks_like_requirements_query(question)


def handle_general_chat(question: str, df: pd.DataFrame, llm, vector_store, intent=None):
    """
    Catch-all route. Strategy:
      1. If the question looks like a data query, run natural_filter first.
         If that returns results, answer from the data (LLM or template).
      2. Otherwise fall back to the vector store + LLM for conversational answers.
      3. If the LLM is unavailable, always return a template string — never None.
    """
    settings = get_settings()

    if _looks_like_data_query(question):
        try:
            result = natural_filter(df, question, top_n=10, use_recency=True)
            if not result.empty:
                cols = [c for c in FILTER_COLS if c in result.columns]
                table_text = result[cols].to_string(index=False)
                retrieved = vector_store.query(question, n_results=5)
                prompt = build_answer_prompt(question, "general_rag", table_text, retrieved, intent=intent)
                answer = llm.answer(prompt) or filter_answer(question, result)
                tables = [table_spec("Results", result, cols, settings.max_rows_to_llm)]
                return answer, tables, [], {}
        except Exception as exc:
            logger.warning("general_chat analytics failed, falling through to vector store: %s", exc)

    # Pure conversational / general VT knowledge fallback.
    retrieved = vector_store.query(question, n_results=6)
    from app.rag.prompts import build_rag_only_prompt
    prompt = build_rag_only_prompt(question, retrieved, intent=intent) if retrieved else f"Student's question: {question}"
    answer = llm.answer(prompt) or general_answer(question)
    return answer, [], [], {}
