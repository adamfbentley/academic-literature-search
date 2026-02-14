# Academic Literature Search

**AI-powered academic search engine aggregating OpenAlex, Semantic Scholar, and arXiv with intelligent summarization.**

🚀 **Live:** [https://main.d3bx8zuggsa7j9.amplifyapp.com/](https://main.d3bx8zuggsa7j9.amplifyapp.com/)

## Overview

Modern academic literature search platform that combines three major research databases with GPT-powered analysis. Generates both quick research landscape overviews and in-depth 1-page syntheses to accelerate literature review workflows.

**Key Value:** Traditional academic search requires manually cross-referencing multiple platforms. This aggregates results, deduplicates by DOI/title, enriches arXiv preprints with citation data via Semantic Scholar, and provides AI-generated summaries to quickly assess research landscapes.

## Features

### Core Search
- 🔍 **Multi-source aggregation:** OpenAlex (relevance/concept filtering) → Semantic Scholar (citation enrichment) → arXiv (opt-in preprints)
- 🎯 **Smart filtering:** Year range, minimum citations, topic/concept filters (OpenAlex Concepts API)
- 📊 **Deduplication:** Matches by DOI + normalized title; preserves best citation counts across sources
- ⚡ **Caching:** DynamoDB with 7-day search cache, 24-hour deep overview cache

### AI Analysis
- 🤖 **Research Landscape Overview:** Quick 4-6 sentence summary with key themes, trends, screening advice
- 📄 **Deep Overview (1-page):** On-demand synthesis of up to 20 papers, including claims, disagreements, evidence types, reading order recommendations
- 💡 **OpenAI integration:** GPT-4o-mini with JSON mode; robust fallbacks if API fails

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
- **API Gateway:** REST API with CORS, Lambda proxy integration
- **Database:** DynamoDB (search cache, overview cache, paper summaries)
- **Deployment:** Manual zip upload to Lambda (future: SAM/CDK automation)

### Integration Flow
```
User → AWS Amplify (static site) 
     → API Gateway 
     → Lambda (search_papers/summarize_paper)
     → DynamoDB (cache)
     → External APIs (OpenAlex/Semantic Scholar/arXiv/OpenAI)
```

## Tech Stack

**Frontend:**
- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Static site generation (`next export`)

**Backend:**
- Python 3.12, AWS Lambda, API Gateway (REST)
- DynamoDB (caching), Requests (HTTP client)
- OpenAI API (GPT-4o-mini), OpenAlex/Semantic Scholar/arXiv APIs

**DevOps:**
- AWS Amplify (CI/CD + hosting), Git/GitHub
- Manual Lambda deployment (zip upload)

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
│   └── deploy.ps1                # Lambda packaging script
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
  "deepOverview": true,
  "deepOverviewMaxPapers": 10,
  "forceRefresh": false,
  "debug": false
}
```

**Response:**
```json
{
  "papers": [...],
  "count": 20,
  "cached": false,
  "sources": ["OpenAlex", "Semantic Scholar"],
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
