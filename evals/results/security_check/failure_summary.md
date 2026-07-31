# Darvis RAG QA Failure Summary

Total tests run: 21
Pass: 21
Partial: 0
Fail: 0
Blocked: 0
Critical failures: 0
Security pass rate: 100.0%
Retrieval pass rate: N/A
Grade analytics pass rate: N/A
Multi-hop pass rate: N/A
NLP / typos / slang pass rate: N/A
Fallback pass rate: N/A

## By Category
- Prompt Injection: {'Pass': 5}
- Security: {'Pass': 16}

## Failures / Partials / Blocked
No failures recorded.

## Regression Summary

The current eval harness verifies workbook-driven behavior, writes raw responses, and flags safety/grounding failures. Re-run after backend changes with `python evals/run_rag_qa.py --all`.
