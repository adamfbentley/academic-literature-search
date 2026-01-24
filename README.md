# Academic Literature AI Reviewer

AI-assisted literature review tool for academic researchers to discover and summarize research papers in niche fields.

## Architecture

- **Frontend**: Next.js + React (Phase 3)
- **Backend**: AWS Lambda + API Gateway
- **Database**: DynamoDB for caching
- **AI**: AWS Bedrock (Claude) or OpenAI
- **Paper Sources**: Semantic Scholar, PubMed, arXiv

## Project Structure

```
academic-literature-ai/
├── backend/
│   ├── lambda/
│   │   ├── search_papers/       # Paper search Lambda
│   │   └── summarize_papers/    # AI summarization Lambda
│   ├── requirements.txt
│   └── deploy.sh
├── frontend/                     # Next.js app (Phase 3)
├── infrastructure/               # AWS CloudFormation/CDK (optional)
└── README.md
```

## Current Status

**Phase 1: Backend MVP** ✅ In Progress
- Paper search Lambda function
- Semantic Scholar API integration
- DynamoDB caching setup

## Setup

See `backend/AWS_SETUP.md` for AWS console instructions.
