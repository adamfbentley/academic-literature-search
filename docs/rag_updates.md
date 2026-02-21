# RAG Updates

This document summarizes the major RAG upgrades currently implemented.

## Backend Changes

- Added section-aware chunking in `backend/lambda/rag_pipeline/lambda_function.py`.
- Added structured extraction at ingest:
  - `researchQuestion`
  - `methodology`
  - `datasetSize`
  - `modelType`
  - `keyFindings`
  - `limitationsText`
  - `futureWork`
- Added hybrid reranking in retrieval:
  - semantic vector score
  - lexical overlap score
  - citation-count signal
- Added new `/rag` actions:
  - `ask`: grounded answer with citations (existing, now hybrid retrieval-backed)
  - `insights`: cross-paper field mapping (agreements, contradictions, methods, timeline, gaps)
  - `gaps`: focused research gap detection + supporting evidence

## Frontend Changes

- Updated RAG workspace with dedicated controls for:
  - `Run RAG Query` (`ask`)
  - `Field Map` (`insights`)
  - `Detect Gaps` (`gaps`)
- Added UI panels to render:
  - agreement clusters
  - contradictions
  - methodological differences
  - timeline evolution
  - research gaps
  - supporting evidence

## API Summary

Endpoint: `POST /rag`

Supported actions:
- `ingest`
- `ask`
- `insights`
- `gaps`

## Deployment Note

These changes require backend redeploy of the `rag-pipeline` Lambda plus frontend redeploy in Amplify to expose the new UI and action types.
