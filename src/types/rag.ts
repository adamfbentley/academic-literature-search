import { Paper } from '@/types/paper';

export type RagSource = 'openalex' | 'semantic_scholar' | 'crossref';
export type RagTask = 'qa' | 'synthesis' | 'comparison' | 'outline';
export type CitationStyle = 'apa' | 'mla' | 'ieee';

export interface RagIngestRequest {
  action: 'ingest';
  namespace?: string;
  query?: string;
  limit?: number;
  maxCandidates?: number;
  sources?: RagSource[];
  papers?: Paper[];
  extractPdfText?: boolean;
  chunkSizeWords?: number;
  chunkOverlapWords?: number;
  minChunkWords?: number;
  timeBudgetSeconds?: number;
}

export interface RagSkippedPaper {
  paperId?: string;
  title?: string;
  reason?: string;
}

export interface RagFailedPaper {
  paperId?: string;
  title?: string;
  error?: string;
}

export interface RagIngestResponse {
  namespace: string;
  discoveredCount?: number;
  candidateCount?: number;
  selectedCandidateCount?: number;
  candidateCap?: number;
  truncatedCandidates?: number;
  ingestedPapers: number;
  ingestedChunks: number;
  skippedPapers: RagSkippedPaper[];
  failedPapers: RagFailedPaper[];
  requestedPdfExtraction?: boolean;
  effectivePdfExtraction?: boolean;
  pdfExtractionDisabledReason?: string | null;
  discoveryBudgetSeconds?: number;
  discoveryBudgetHit?: boolean;
  embeddingModel?: string;
  vectorProvider?: string;
  message?: string;
  timedOut?: boolean;
  timeBudgetSeconds?: number;
}

export interface RagReference {
  citationNumber: number;
  paperId?: string;
  title?: string;
  year?: number | string;
  venue?: string;
  source?: string;
  doi?: string;
  url?: string;
  formatted: string;
}

export interface RagRetrievalMeta {
  topK: number;
  returned: number;
  namespace: string;
  embeddingModel?: string;
  chatModel?: string;
}

export interface RagContext {
  rank: number;
  citationNumber?: number;
  paperId?: string;
  title?: string;
  score?: number;
  chunkIndex?: number;
  snippet?: string;
}

export interface RagAskResponse {
  question: string;
  task: RagTask;
  answer: string;
  crossPaperSynthesis: string[];
  limitations: string[];
  nextQuestions: string[];
  confidence: 'high' | 'medium' | 'low' | string;
  references: RagReference[];
  retrieval: RagRetrievalMeta;
  contexts?: RagContext[];
}
