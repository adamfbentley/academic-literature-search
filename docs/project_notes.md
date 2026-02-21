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
- Add section-aware chunking so retrieval can target method/result/discussion evidence more precisely.
- Extract structured paper fields at ingest time (`researchQuestion`, `methodology`, `datasetSize`, `modelType`, `keyFindings`, `limitationsText`, `futureWork`) and persist as vector metadata.

### Retrieval and Synthesis Quality

- Use hybrid reranking after vector search: semantic similarity + lexical overlap + citation signal.
- Add dedicated cross-paper intelligence actions:
  - `action=insights`: agreement clusters, contradictions, methodological differences, timeline evolution, and research gaps.
  - `action=gaps`: focused research-gap detection using limitations/future-work evidence.
- Keep citation-grounding constraints in generation to reduce hallucinated references.

### Validation and Maintainability

- Backend unit tests for ranking, dedup provenance, and ingest guardrails.
- Reproducible benchmark harness (`scripts/project_eval.py`) with fixed eval cases.
- GitHub Actions CI for build + backend compile + tests on every push/PR.

## Validation Workflow

1. Confirm CI passes (`frontend-build`, `backend-tests`).
2. Run `scripts/project_eval.py` and inspect `benchmarks/eval/latest_report.json`.
3. Validate live `/search` source distribution via `sourceBreakdown`.
4. Validate live `/rag` responses:
   - `ask` includes inline citations and references.
   - `insights` returns structured field-map outputs.
   - `gaps` returns gap statements with supporting evidence.
5. Track ingest timeout/deferred rates and tune caps/budgets as needed.

## Next Iteration Targets

- Add offline retrieval eval with relevance labels for `ask`/`insights`/`gaps`.
- Add citation-accuracy audits (claim-to-source mapping checks).
- Add duplicate-paper identity reconciliation across providers at corpus scale.
- Move large ingest jobs to async orchestration (SQS/Step Functions).
