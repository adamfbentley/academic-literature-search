# Academic Literature AI: Project Notes

## Problem

Academic literature workflows are fragmented across sources, and generic LLM answers are often ungrounded.  
This project unifies cross-source search and citation-grounded RAG synthesis into a deployable full-stack system.

## Objectives

1. Improve search recall across disciplines.
2. Reduce source-order bias in ranking.
3. Support reliable ingestion for grounded QA over a corpus.
4. Expose measurable quality indicators for ongoing reliability.

## Architecture

- Frontend: Next.js 14 + TypeScript (AWS Amplify hosting)
- Backend:
  - `search-academic-papers` Lambda
  - `summarize_paper` Lambda
  - `rag-pipeline` Lambda
- API Gateway REST endpoints: `/search`, `/summarize`, `/rag`
- Vector DB: Pinecone
- LLM/embeddings: OpenAI
- Cache: DynamoDB

## Key Engineering Decisions

### Search Fairness and Coverage

- Query all enabled providers (OpenAlex, Semantic Scholar, Crossref, optional arXiv) rather than sequential source fill.
- Over-fetch before dedup/filter to preserve recall after normalization.
- Introduce source-diversified relevance ranking to reduce one-provider domination.
- Add `sourceBreakdown` in API response for transparent source contribution.

### RAG Ingestion Reliability

- Keep synchronous timeout-safe ingest budgets for API Gateway constraints.
- Use candidate caps + deferred reporting instead of hard failures.
- Allow query-mode PDF extraction for a configurable top-N (`queryPdfPaperLimit`) rather than all-or-none.
- Add metadata fallback ingestion so records with sparse text still become retrievable.

### Validation and Maintainability

- Backend unit tests for ranking, dedup provenance, and ingest guardrails.
- Reproducible benchmark harness (`scripts/project_eval.py`) with fixed eval cases.
- GitHub Actions CI for build + backend compile + tests on every push/PR.

## Validation Workflow

1. Confirm CI passes (`frontend-build`, `backend-tests`).
2. Run `scripts/project_eval.py` and inspect `benchmarks/eval/latest_report.json`.
3. Validate live `/search` source distribution via `sourceBreakdown`.
4. Validate live `/rag` responses include inline citations and references.
5. Track ingest timeout/deferred rates and tune caps/budgets as needed.

## Next Iteration Targets

- Why source-diversity ranking improves fairness in relevance mode.
- Why RAG ingestion must be timeout-aware in synchronous serverless APIs.
- How grounded QA quality can be evaluated without expensive human labeling.
- What would be next: async ingestion pipeline (SQS/Step Functions), offline retrieval eval set, and citation-accuracy audits.
