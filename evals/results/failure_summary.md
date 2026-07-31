# Darvis RAG QA Failure Summary

Total tests run: 109
Pass: 102
Partial: 7
Fail: 0
Blocked: 0
Critical failures: 0
Security pass rate: 100.0%
Retrieval pass rate: 92.3%
Grade analytics pass rate: 100.0%
Multi-hop pass rate: 87.5%
NLP / typos / slang pass rate: 91.7%
Fallback pass rate: 100.0%

## By Category
- Ambiguity: {'Partial': 3, 'Pass': 5}
- Course Retrieval: {'Pass': 7, 'Partial': 1}
- Grade Outcomes: {'Pass': 10}
- LLM Fallback: {'Pass': 10}
- Missing Data: {'Pass': 8}
- Multi-Hop RAG: {'Pass': 7, 'Partial': 1}
- NLP / Typos / Slang: {'Pass': 11, 'Partial': 1}
- Professor Info: {'Pass': 8}
- Prompt Injection: {'Pass': 5}
- Schedule / Time: {'Pass': 9, 'Partial': 1}
- Security: {'Pass': 16}
- Source Grounding: {'Pass': 6}

## Failures / Partials / Blocked
- C7 [Course Retrieval] Partial: Response did not clearly preserve expected course code(s): CS 1114, CS 2114.
- T3 [Schedule / Time] Partial: Expected a clarifying question.
- M2 [Multi-Hop RAG] Partial: Response did not clearly preserve expected course code(s): MATH 1225.
- A1 [Ambiguity] Partial: Expected a clarifying question.
- A6 [Ambiguity] Partial: Expected a clarifying question.
- A7 [Ambiguity] Partial: Expected a clarifying question.
- N6 [NLP / Typos / Slang] Partial: Response did not clearly preserve expected course code(s): CHEM 1035, ENGL 1106.

## Regression Summary

The current eval harness verifies workbook-driven behavior, writes raw responses, and flags safety/grounding failures. Re-run after backend changes with `python evals/run_rag_qa.py --all`.
