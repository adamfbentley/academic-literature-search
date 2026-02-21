# Academic Literature Search

**AI-powered academic search engine aggregating OpenAlex, Semantic Scholar, and arXiv with intelligent summarization.**

🚀 **Live:** [https://main.d3bx8zuggsa7j9.amplifyapp.com/](https://main.d3bx8zuggsa7j9.amplifyapp.com/)

## Overview

Modern academic literature search platform that combines three major research databases with GPT-powered analysis. Generates both quick research landscape overviews and in-depth 1-page syntheses to accelerate literature review workflows.

**Key Value:** Traditional academic search requires manually cross-referencing multiple platforms. This aggregates results, deduplicates by DOI/title, enriches arXiv preprints with citation data via Semantic Scholar, and provides AI-generated summaries to quickly assess research landscapes.

For implementation notes and architecture decisions, see: `docs/project_notes.md`.

## Features

### Core Search
- 🔍 **Multi-source aggregation:** OpenAlex + Semantic Scholar + Crossref + optional arXiv preprints
- 🎯 **Smart filtering:** Year range, minimum citations, topic/concept filters (OpenAlex Concepts API)
- 📊 **Deduplication:** Matches by DOI + normalized title; preserves best citation counts across sources
- ⚖️ **Source-diversified relevance ranking:** Interleaves sources to reduce source-order bias in relevance mode
- ⚡ **Caching:** DynamoDB with 7-day search cache, 24-hour deep overview cache

### AI Analysis
- 🤖 **Research Landscape Overview:** Quick 4-6 sentence summary with key themes, trends, screening advice
- 📄 **Deep Overview (1-page):** On-demand synthesis of up to 20 papers, including claims, disagreements, evidence types, reading order recommendations
- 💡 **OpenAI integration:** GPT-4o-mini with JSON mode; robust fallbacks if API fails

### RAG Pipeline (New)
- 🧱 **Paper ingestion pipeline:** Accepts direct papers or query-driven discovery from OpenAlex/Semantic Scholar/Crossref
- 🧩 **Chunking + embeddings:** Splits abstract/full text/PDF text into chunks and embeds via OpenAI embeddings
- 🗄️ **Vector database:** Pinecone-backed chunk storage and nearest-neighbor retrieval
- 🧠 **Grounded synthesis:** LLM synthesis using retrieved chunks only, with inline citation tags like `[1]`
- 🧾 **Citation formatter:** Automatic APA/MLA/IEEE reference formatting in responses
- 🛡️ **Timeout-safe ingest guardrails:** candidate caps, deferred batches, and query-PDF extraction limits
- 🧱 **Metadata fallback ingestion:** papers without abstract/full text still ingest metadata context for recall

### UI/UX
- 🎨 **Modern interface:** Next.js 14 + Tailwind CSS, dark mode support
- 📱 **Responsive design:** Mobile-first, fully responsive across devices
- 🔗 **Direct access:** Links to papers, PDFs, and DOI resolution
- 📈 **Citation display:** Shows citation counts with source attribution

### Advanced Options
- 🔬 **arXiv toggle:** Off by default to avoid physics/CS skew; opt-in for preprints
- 🔄 **Sort modes:** Relevance (default), citations, or date
- 🎓 **Topic filtering:** Natural language → OpenAlex concept IDs for narrow searches

## Architecture

### Frontend (AWS Amplify)
- **Framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Deployment:** Static export (`out/`) auto-deployed from GitHub `main` branch
- **Hosting:** AWS Amplify with automatic CI/CD on push
- **Config:** `amplify.yml` specifies build commands and output directory

### Backend (AWS Lambda + API Gateway)
- **Search Lambda:** Multi-source aggregation, deduplication, caching, AI summarization
  - OpenAlex API (primary source; best rate limits)
  - Semantic Scholar Graph API (citations + enrichment)
  - arXiv API (opt-in preprints)
- **Summarize Lambda:** GPT-powered paper summarization with 30-day cache
- **RAG Pipeline Lambda:** Ingestion + retrieval + source-grounded QA/synthesis with citations
- **API Gateway:** REST API with CORS, Lambda proxy integration
- **Database:** DynamoDB (search cache, overview cache, paper summaries)
- **Deployment:** Manual zip upload to Lambda (future: SAM/CDK automation)

### Integration Flow
```
User → AWS Amplify (static site) 
     → API Gateway 
     → Lambda (search_papers/summarize_paper/rag_pipeline)
     → DynamoDB (cache)
     → Pinecone (RAG vector index)
     → External APIs (OpenAlex/Semantic Scholar/arXiv/Crossref/OpenAI)
```

## Tech Stack

**Frontend:**
- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Static site generation (`next export`)

**Backend:**
- Python 3.12, AWS Lambda, API Gateway (REST)
- DynamoDB (caching), Requests (HTTP client)
- OpenAI API (chat + embeddings), Pinecone, OpenAlex/Semantic Scholar/arXiv/Crossref APIs

**DevOps:**
- AWS Amplify (CI/CD + hosting), Git/GitHub
- Manual Lambda deployment (zip upload)

## Quality Infrastructure

- ✅ **Automated CI:** `.github/workflows/ci.yml` runs frontend build + backend compile + backend tests on every push/PR.
- ✅ **Backend test suite:** `backend/tests/` validates search source-diversity ranking, dedup provenance merging, and RAG ingest guardrails.
- ✅ **Reproducible evaluation harness:** `scripts/project_eval.py` runs benchmark cases and outputs objective metrics JSON.
- ✅ **Benchmark datasets:** `benchmarks/eval/search_cases.json` and `benchmarks/eval/rag_cases.json`.

### Local Quality Commands

```bash
# Frontend build (type + bundle validation)
npm run build

# Backend tests
pip install -r backend/lambda/search_papers/requirements.txt
pip install -r backend/lambda/rag_pipeline/requirements.txt
pip install -r backend/requirements-dev.txt
python -m pytest

# Project benchmark (against deployed API)
python scripts/project_eval.py \
  --api-url https://your-api-id.execute-api.region.amazonaws.com/prod \
  --namespace project-eval
```

### Benchmark Metrics (from `project_eval.py`)

- **Search**
  - `nonEmptyRate`: fraction of benchmark queries returning at least one paper
  - `avgSourceDiversity`: average count of contributing sources per query
  - `crossrefCoverageRate`: fraction of queries with at least one Crossref result
  - `errorRate`: non-200 request rate
- **RAG**
  - `groundedProxyPassRate`: fraction of cases with minimum inline citations + references + answer length
  - `avgCitationDensityPer100Words`: citation frequency proxy
  - `ingestTimeoutRate`: frequency of deferred ingest due to time budget

## Project Structure

```
├── src/                          # Next.js frontend
│   ├── app/
│   │   ├── page.tsx              # Main search page
│   │   ├── layout.tsx            # Root layout
│   │   └── globals.css           # Global styles
│   ├── components/
│   │   ├── SearchBar.tsx         # Search input + advanced filters
│   │   ├── PaperCard.tsx         # Paper display + per-paper summarization
│   │   └── LoadingSpinner.tsx    # Loading state
│   └── types/
│       └── paper.ts              # TypeScript interfaces
├── backend/
│   ├── lambda/
│   │   ├── search_papers/
│   │   │   └── lambda_function_multisource.py  # Multi-source search + AI overview
│   │   └── summarize_paper/
│   │       └── lambda_function.py              # Per-paper AI summarization
│   │   └── rag_pipeline/
│   │       ├── lambda_function.py              # Ingestion + RAG QA + citation formatting
│   │       └── requirements.txt
│   └── deploy.ps1                # Lambda packaging script
│   └── deploy-rag.ps1            # RAG Lambda packaging script
├── amplify.yml                   # AWS Amplify build config
├── package.json                  # Node.js dependencies
└── tsconfig.json                 # TypeScript config
```

## Setup & Development

### Prerequisites
- Node.js 18+
- AWS account with Lambda, API Gateway, DynamoDB, Amplify access
- OpenAI API key

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   Create `.env.local`:
   ```
   NEXT_PUBLIC_API_URL=https://your-api-gateway-url.amazonaws.com/prod
   ```

3. **Run dev server:**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

### Backend Deployment (Lambda)

1. **Package Lambda function:**
   ```bash
   cd backend/lambda/search_papers
   zip -r function.zip lambda_function_multisource.py
   ```

2. **Upload to AWS Lambda:**
   - AWS Console → Lambda → Function → Upload .zip
   - Or use AWS CLI:
     ```bash
     aws lambda update-function-code \
       --function-name search_papers \
       --zip-file fileb://function.zip
     ```

3. **Environment variables** (set in Lambda console):
   - `DYNAMODB_TABLE` — DynamoDB table name (default: `academic-papers-cache`)
   - `OPENAI_API_KEY` — enables AI summaries and deep overviews (optional; degrades gracefully)
   - `OPENAI_MODEL` — model name (default: `gpt-4o-mini`)
   - `OPENALEX_MAILTO` — contact email for polite OpenAlex API usage
   - `SEMANTIC_SCHOLAR_API_KEY` — optional; raises S2 rate limits

### RAG Lambda Deployment (`rag_pipeline`)

1. **Package Lambda function:**
   ```bash
   cd backend/lambda/rag_pipeline
   zip -r function.zip lambda_function.py
   ```
   Or run:
   ```powershell
   ./backend/deploy-rag.ps1
   ```

2. **Upload to AWS Lambda:**
   ```bash
   aws lambda update-function-code \
     --function-name rag-pipeline \
     --zip-file fileb://function.zip
   ```

3. **Environment variables** (required for RAG):
   - `OPENAI_API_KEY`
   - `OPENAI_EMBED_MODEL` (default: `text-embedding-3-small`)
   - `OPENAI_CHAT_MODEL` (default: `gpt-4o-mini`)
   - `PINECONE_API_KEY`
   - `PINECONE_INDEX_HOST` (host for your Pinecone index)
   - `PINECONE_NAMESPACE` (default namespace, optional)

4. **Optional RAG env vars:**
   - `MAX_PDF_TEXT_CHARS` (default: `120000`)
   - `RAG_MAX_CONTEXT_CHARS` (default: `16000`)
   - `OPENALEX_MAILTO` (for discovery mode)
   - `SEMANTIC_SCHOLAR_API_KEY` (for higher S2 limits)

4. **API Gateway:**
   - Create REST API with Lambda proxy integration
   - Enable CORS
   - Deploy to stage (e.g., `prod`)

5. **DynamoDB:**
   - Table: `academic-papers-cache`
   - Primary key: `searchKey` (String)
   - TTL enabled on `ttl` attribute

### Frontend Deployment (AWS Amplify)

1. **Connect GitHub repo:**
   - AWS Amplify Console → New App → GitHub
   - Select `academic-literature-search` repo
   - Branch: `main`

2. **Build settings:**
   Amplify auto-detects Next.js; uses `amplify.yml`:
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm ci
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: out
       files:
         - '**/*'
   ```

3. **Environment variables:**
   Add in Amplify Console:
   ```
   NEXT_PUBLIC_API_URL=https://your-api-id.execute-api.region.amazonaws.com/prod
   ```

4. **Deploy:**
   - Push to `main` branch triggers automatic rebuild
   - Amplify serves static files from `out/` directory

## Usage

### Basic Search
1. Enter query (e.g., "machine learning", "david hume philosophy")
2. Optional filters: year range, minimum citations, arXiv toggle
3. View results with citations, abstracts, direct links

### AI Summaries
- **Research Landscape Overview:** Auto-generated at top of results
- **Deep Overview:** Click "Generate In-Depth Overview" for 1-page synthesis

### Advanced Features
- **Topic filtering:** Use specific concepts (e.g., "quantum computing") for narrow results
- **Sort modes:** Relevance (default), citations, or date
- **Force refresh:** Add `forceRefresh: true` in API call to bypass cache

## API Reference

### Search Endpoint
```
POST /search
```

**Request:**
```json
{
  "query": "quantum machine learning",
  "limit": 20,
  "fromYear": 2020,
  "toYear": 2024,
  "minCitations": 10,
  "sort": "relevance",
  "includeArxiv": false,
  "includeCrossref": true,
  "deepOverview": true,
  "deepOverviewMaxPapers": 10,
  "forceRefresh": false,
  "debug": false
}
```

### RAG Endpoint
```
POST /rag
```

`/rag` supports `action: "ingest"` and `action: "ask"`.

**Ingest request:**
```json
{
  "action": "ingest",
  "query": "retrieval-augmented generation",
  "limit": 15,
  "sources": ["openalex", "semantic_scholar", "crossref"],
  "namespace": "ml-corpus",
  "extractPdfText": true,
  "queryPdfPaperLimit": 2,
  "timeBudgetSeconds": 24,
  "chunkSizeWords": 220,
  "chunkOverlapWords": 40
}
```

**Ask request:**
```json
{
  "action": "ask",
  "question": "What are current best practices for RAG evaluation?",
  "task": "synthesis",
  "topK": 8,
  "namespace": "ml-corpus",
  "citationStyle": "apa",
  "returnContexts": false
}
```

**Ask response shape (truncated):**
```json
{
  "answer": ".... [1] ... [3]",
  "crossPaperSynthesis": ["..."],
  "limitations": ["..."],
  "references": [
    {
      "citationNumber": 1,
      "formatted": "Author, A. (2024). Title..."
    }
  ]
}
```

**Response:**
```json
{
  "papers": [...],
  "count": 20,
  "cached": false,
  "sources": ["OpenAlex", "Semantic Scholar"],
  "sourceBreakdown": {
    "OpenAlex": 11,
    "Crossref": 9
  },
  "summary": {
    "overview": "...",
    "key_themes": [...],
    "research_trends": "...",
    "top_cited": {...}
  },
  "deep_overview": {
    "one_page_summary": "...",
    "key_claims": [...],
    "recommended_reading_order": [...]
  }
}
```

## Future Enhancements

- [ ] Infrastructure as Code (AWS SAM/CDK) for Lambda deployment
- [ ] User accounts + saved searches
- [ ] Citation graph visualization
- [ ] Export to BibTeX/Zotero
- [ ] PDF full-text search integration
- [ ] Collaborative annotation features

## Contributing

Pull requests welcome. For major changes, open an issue first to discuss.

## License

MIT

## Contact

**Adam Bentley**  
📧 adam.f.bentley@gmail.com  
🐙 [github.com/adamfbentley](https://github.com/adamfbentley)
