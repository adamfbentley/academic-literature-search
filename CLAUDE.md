# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Project: Academic Literature AI

Full-stack academic literature search + RAG synthesis platform. A Next.js 14 frontend (static export, hosted on AWS Amplify) talks to three Python AWS Lambdas behind API Gateway. The system aggregates OpenAlex, Semantic Scholar, Crossref, and (optionally) arXiv, generates AI summaries and overviews, and runs a citation-grounded RAG pipeline backed by Pinecone + OpenAI.

Live: https://main.d3bx8zuggsa7j9.amplifyapp.com/

## Architecture

```
User → Next.js (Amplify static export, /out)
     → API Gateway (REST, CORS, Lambda proxy)
         ├── /search    → search_papers Lambda  (multi-source aggregation + AI overview)
         ├── /summarize → summarize_paper Lambda (per-paper AI summary, 30d cache)
         └── /rag       → rag_pipeline Lambda   (ingest | ask | insights | gaps)
     → DynamoDB (search/overview/summary cache, TTL on `ttl` attribute)
     → Pinecone (RAG vector index)
     → External APIs: OpenAlex, Semantic Scholar, Crossref, arXiv, OpenAI
```

### Frontend ([src/](src/))
- Next.js 14 App Router + TypeScript + Tailwind (`darkMode: 'class'`, custom `primary`/`accent`/`neon`/`surface` palette).
- `next.config.js` sets `output: 'export'` — site builds to `out/` for Amplify static hosting. No server runtime; no API routes; everything goes through `NEXT_PUBLIC_API_URL`.
- Path alias: `@/* → src/*`.
- Key files:
  - [src/app/page.tsx](src/app/page.tsx) — orchestrates search, deep overview, bookmarks (localStorage), corpus queue, RAG workspace, toast.
  - [src/components/SearchBar.tsx](src/components/SearchBar.tsx) — query + advanced filters.
  - [src/components/PaperCard.tsx](src/components/PaperCard.tsx) — calls `/summarize`, expandable abstract, bookmark + corpus-queue actions, BibTeX copy.
  - [src/components/RagWorkspace.tsx](src/components/RagWorkspace.tsx) — all four `/rag` actions (`ingest`, `ask`, `insights`, `gaps`) with ingest controls, citation styles, metadata filters.
  - [src/types/paper.ts](src/types/paper.ts), [src/types/rag.ts](src/types/rag.ts) — request/response shapes shared by UI and what backend returns.

### Backend ([backend/lambda/](backend/lambda/))
- Python 3.11/3.12. Each Lambda is a single `lambda_function*.py` file plus its `requirements.txt`. Vendored deps (`pypdf`, `urllib3`, `idna`, `charset_normalizer`, …) live alongside the source so the zip is self-contained.
- All handlers return API-Gateway-shaped responses with CORS headers (`Access-Control-Allow-Origin: *`).
- [backend/lambda/search_papers/lambda_function_multisource.py](backend/lambda/search_papers/lambda_function_multisource.py) — multi-source fetch → over-fetch → dedup by DOI/title → source-diversified relevance ranking → AI landscape overview (GPT-4o-mini, JSON mode) → optional deep overview. Caches in DynamoDB.
- [backend/lambda/summarize_paper/lambda_function.py](backend/lambda/summarize_paper/lambda_function.py) — per-paper summary with 30-day cache; only successful AI summaries are cached (failures aren't, so fixing quotas doesn't require cache busting).
- [backend/lambda/rag_pipeline/lambda_function.py](backend/lambda/rag_pipeline/lambda_function.py) — dispatcher in `lambda_handler` routes by `action`:
  - `ingest`: discover via OpenAlex/S2/Crossref or accept direct `papers[]`, normalize, optional PDF extraction via `pypdf` (capped via `queryPdfPaperLimit`), section-aware chunking, OpenAI embeddings, Pinecone upsert. Honors `timeBudgetSeconds` (defers candidates instead of failing). Also runs structured field extraction (`researchQuestion`, `methodology`, `datasetSize`, `modelType`, `keyFindings`, `limitationsText`, `futureWork`).
  - `ask`: embed question → Pinecone query (+metadata filter) → hybrid rerank (semantic + lexical + citation signal) → grounded chat completion with inline `[n]` citations and APA/MLA/IEEE references.
  - `insights`: cross-paper field map — agreement clusters, contradictions, methodological differences, timeline evolution, research gaps, per-paper profiles.
  - `gaps`: focused research-gap detection with supporting evidence.
  - `corpus`: broad Pinecone query against a namespace, dedupe by `paperId`, return one row per paper with all structured fields (powers the **Methodology Comparison** table). Uses a generic seed embedding (`RAG_CORPUS_LIST_SEED_QUERY`) — realistic for namespaces up to a few hundred papers.
  - `hypothesis`: embed a user-supplied claim → hybrid retrieval → single LLM call that classifies each cited chunk as `support`/`contradict`/`neutral`/`insufficient` and returns a verdict (`supported`/`contested`/`contradicted`/`insufficient`) plus per-side evidence bullets. Falls back to `insufficient` if no API key or matches.

### Caching
- DynamoDB table `academic-papers-cache`, primary key `searchKey` (String), TTL attribute `ttl`. Search cache 7d, deep overview 24h, paper summary 30d.

### Quality infrastructure
- CI: [.github/workflows/ci.yml](.github/workflows/ci.yml) — frontend build + py_compile + pytest + `project_eval.py --help` on push/PR to `main`.
- Tests: [backend/tests/](backend/tests/) — covers source-diversified ranking, dedup provenance merging, RAG ingest guardrails (PDF cap, metadata fallback). Uses `importlib` to load the Lambda modules directly. `pytest.ini` points `testpaths` at `backend/tests` with `-q`.
- Evaluation harness: [scripts/project_eval.py](scripts/project_eval.py) hits a live API (`--api-url`) and writes `benchmarks/eval/latest_report.json`. Cases live in [benchmarks/eval/search_cases.json](benchmarks/eval/search_cases.json) and [benchmarks/eval/rag_cases.json](benchmarks/eval/rag_cases.json).

## Conventions

### Frontend
- `'use client'` directive on every interactive component (App Router default is server).
- Use the `@/` path alias for intra-`src/` imports.
- Tailwind only; no CSS modules. Match the existing color/shadow tokens (`primary-*`, `accent-*`, `neon-*`, `surface-*`, `shadow-glass`, `shadow-glow`, `animate-fade-in-up`, etc.) rather than inventing new ones.
- All API calls read `process.env.NEXT_PUBLIC_API_URL` and POST JSON; backend errors come back as `{error: string}` — surface via existing error panel pattern.
- LocalStorage keys in use: `bookmarkedPapers`, `searchHistory`, `corpusQueuePapers`. Keep these stable.
- TypeScript is strict; reuse `Paper` / `Rag*` types from [src/types/](src/types/) rather than redefining ad hoc.

### Backend
- Single-file Lambdas, stdlib + `requests`. Avoid heavy frameworks (the deploy story is a plain zip upload).
- Always go through the helpers at the top of each file: `parse_event_body`, `create_response`, `clamp_int`, `as_bool`, `clean_text`. They handle both API Gateway proxy events and direct Lambda console test payloads.
- Honor the time budget (`INGEST_TIME_BUDGET_SECONDS`, `timeBudgetSeconds`) — API Gateway times out around 29s, so prefer deferring work and returning partial results (`timedOut: true`, `truncatedCandidates`) over hard failures.
- New tunables go through env vars with sane defaults (see the constants block at the top of `rag_pipeline/lambda_function.py`).
- When adding a new `/rag` action, branch inside `lambda_handler` (~line 1755) and add a `handle_*` function. Update [src/types/rag.ts](src/types/rag.ts) and [src/components/RagWorkspace.tsx](src/components/RagWorkspace.tsx) in lockstep.

### Tests
- Tests load lambdas via `importlib.util.spec_from_file_location` (see helper at the top of each test file) — keep that pattern so the module path doesn't have to be on `sys.path`.
- Network is monkey-patched out (`mod.openai_embed_texts = ...`, `mod.pinecone_upsert = ...`, `mod.discover_papers = ...`). Do the same for any new external call.

### Git / commits
- Imperative, lowercase-ish, no scope prefix. Recent style: "Document RAG insights, gaps, and hybrid retrieval updates", "Harden RAG ingest against API timeout and surface deferred ingestion".

## Custom commands

> Most commands assume Windows + PowerShell (the deploy scripts are PowerShell-only). The repo also runs on Linux CI; pytest/npm/python commands are cross-platform.

### Frontend
- **Run dev server** — `npm run dev` (opens http://localhost:3000). Requires `.env.local` with `NEXT_PUBLIC_API_URL=<api-gateway-base>`.
- **Production build** (static export to `out/`) — `npm run build`. This is what Amplify runs via [amplify.yml](amplify.yml).
- **Lint** — `npm run lint` (Next's built-in ESLint).
- **Install deps** — `npm ci` (clean, matches CI) or `npm install`.

### Backend
- **Install dev/test deps**:
  ```powershell
  pip install -r backend/lambda/search_papers/requirements.txt
  pip install -r backend/lambda/rag_pipeline/requirements.txt
  pip install -r backend/requirements-dev.txt
  ```
- **Run all tests** — `python -m pytest` (uses [pytest.ini](pytest.ini), discovers [backend/tests/](backend/tests/)).
- **Run one test file** — `python -m pytest backend/tests/test_rag_pipeline.py -v`.
- **Compile-check a Lambda** (mirrors CI) — `python -m py_compile backend/lambda/rag_pipeline/lambda_function.py`.

### Evaluation
- **Help** — `python scripts/project_eval.py --help` (also runs in CI as a sanity check).
- **Full benchmark against the deployed API**:
  ```powershell
  python scripts/project_eval.py `
    --api-url https://<api-id>.execute-api.<region>.amazonaws.com/prod `
    --namespace project-eval
  ```
  Writes [benchmarks/eval/latest_report.json](benchmarks/eval/latest_report.json) with `search` and `rag` metrics blocks.
- **Search-only run** (skips RAG ingest, much faster) — add `--skip-rag`.
- **Custom case files** — `--search-cases <path>` / `--rag-cases <path>`.

### Lambda deployment (manual zip upload)
The deploy scripts are PowerShell-only and `cd` into the Lambda's directory, install deps in place with `pip install -r requirements.txt -t .`, then `Compress-Archive` the contents. Run from `backend/`.

- **Package search Lambda** — `./backend/deploy.ps1` → `backend/lambda/search_papers/lambda_function.zip`.
- **Package summarize Lambda** — `./backend/deploy-summarize.ps1` → `backend/lambda/summarize_paper/summarize_paper_function.zip`.
- **Package RAG Lambda** — `./backend/deploy-rag.ps1` → `backend/lambda/rag_pipeline/rag_pipeline_function.zip`.
- **Upload via AWS CLI** (after packaging):
  ```powershell
  aws lambda update-function-code --function-name search-academic-papers `
    --zip-file fileb://backend/lambda/search_papers/lambda_function.zip

  aws lambda update-function-code --function-name summarize_paper `
    --zip-file fileb://backend/lambda/summarize_paper/summarize_paper_function.zip

  aws lambda update-function-code --function-name rag-pipeline `
    --zip-file fileb://backend/lambda/rag_pipeline/rag_pipeline_function.zip
  ```

### Required environment (Lambda console)
- `search_papers` / `summarize_paper`: `DYNAMODB_TABLE`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENALEX_MAILTO`, `SEMANTIC_SCHOLAR_API_KEY` (optional).
- `rag_pipeline`: `OPENAI_API_KEY`, `OPENAI_EMBED_MODEL`, `OPENAI_CHAT_MODEL`, `PINECONE_API_KEY`, `PINECONE_INDEX_HOST`, `PINECONE_NAMESPACE` (optional), plus tunables (`MAX_PDF_TEXT_CHARS`, `RAG_MAX_CONTEXT_CHARS`, `RAG_INGEST_TIME_BUDGET_SECONDS`, etc. — defaults at the top of the file).

## Reference docs

- [README.md](README.md) — user-facing overview, API reference, deployment.
- [docs/project_notes.md](docs/project_notes.md) — engineering decisions, objectives, validation workflow.
- [docs/rag_updates.md](docs/rag_updates.md) — RAG-specific change log (chunking, hybrid rerank, new actions).
