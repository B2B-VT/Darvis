import logging
import pandas as pd
from app.data.analytics import natural_filter
from app.rag.prompts import build_answer_prompt
from app.utils.charts import table_spec
from app.config import get_settings
from app.features.templated_answers import filter_answer, general_answer

logger = logging.getLogger("darvis")

FILTER_COLS = [
    "Course", "Instructor", "Course Title",
    "Avg GPA", "Avg A Range (%)", "Avg F Rate (%)",
    "Total Students", "Terms Taught", "Confidence Label",
]


def handle_general_chat(question: str, df: pd.DataFrame, llm, vector_store, intent=None):
    """
    Catch-all route. Always tries analytics first; falls back to RAG+LLM.
    The LLM handles typos, slang, and NLP — no hardcoded keyword lists here.
    """
    settings = get_settings()

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

    retrieved = vector_store.query(question, n_results=6)
    from app.rag.prompts import build_rag_only_prompt
    prompt = build_rag_only_prompt(question, retrieved, intent=intent) if retrieved else f"Student's question: {question}"
    answer = llm.answer(prompt) or general_answer(question)
    return answer, [], [], {}
