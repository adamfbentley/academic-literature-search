import { Paper } from '@/types/paper';

export type RagSource = 'openalex' | 'semantic_scholar' | 'crossref';
export type RagTask = 'qa' | 'synthesis' | 'comparison' | 'outline';
export type CitationStyle = 'apa' | 'mla' | 'ieee';
export type RagAction = 'ask' | 'ingest' | 'insights' | 'gaps' | 'corpus' | 'hypothesis' | 'propose';

export interface RagIngestRequest {
  action: 'ingest';
  namespace?: string;
  query?: string;
  limit?: number;
  maxCandidates?: number;
  queryPdfPaperLimit?: number;
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
  queryPdfPaperLimit?: number | null;
  queryPdfExtractionSelected?: number;
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
  mode?: string;
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

export interface RagAskRequest {
  action: 'ask';
  question: string;
  namespace?: string;
  task?: RagTask;
  citationStyle?: CitationStyle;
  topK?: number;
  returnContexts?: boolean;
  metadataFilter?: Record<string, unknown>;
}

export interface RagInsightProfile {
  citationNumber?: number;
  paperId?: string;
  title?: string;
  year?: number;
  source?: string;
  methodology?: string;
  datasetSize?: string;
  modelType?: string;
  keyFindings?: string;
  limitations?: string;
  futureWork?: string;
  score?: number;
}

export interface RagInsightsResponse {
  question: string;
  insights: {
    agreementClusters: string[];
    contradictions: string[];
    methodologicalDifferences: string[];
    timelineEvolution: string[];
    researchGaps: string[];
    paperProfiles: RagInsightProfile[];
  };
  references: RagReference[];
  retrieval: RagRetrievalMeta;
  contexts?: RagContext[];
}

export interface RagGapsResponse {
  question: string;
  gaps: string[];
  supportingEvidence: string[];
  references: RagReference[];
  retrieval: RagRetrievalMeta;
}

export interface RagCorpusRequest {
  action: 'corpus';
  namespace?: string;
  maxPapers?: number;
  includeChunkText?: boolean;
  metadataFilter?: Record<string, unknown>;
}

export interface RagCorpusPaper {
  paperId: string;
  title: string;
  authors: string[];
  year: number | null;
  citationCount: number;
  venue: string;
  doi: string;
  url: string;
  pdfUrl: string;
  source: string;
  researchQuestion: string;
  methodology: string;
  datasetSize: string;
  modelType: string;
  keyFindings: string;
  limitations: string;
  futureWork: string;
  chunkCount: number;
  sampleChunk?: string;
}

export interface RagCorpusResponse {
  namespace: string;
  paperCount: number;
  vectorMatchCount: number;
  truncated: boolean;
  papers: RagCorpusPaper[];
  retrieval: {
    namespace: string;
    fetchedVectors: number;
    fetchTopK: number;
    embeddingModel?: string;
    mode?: string;
  };
}

export type HypothesisVerdict = 'supported' | 'contested' | 'contradicted' | 'insufficient';
export type HypothesisStance = 'support' | 'contradict' | 'neutral' | 'insufficient';

export interface RagHypothesisRequest {
  action: 'hypothesis';
  claim: string;
  namespace?: string;
  topK?: number;
  citationStyle?: CitationStyle;
  returnContexts?: boolean;
  metadataFilter?: Record<string, unknown>;
}

export interface RagHypothesisCitation {
  citationNumber: number;
  stance: HypothesisStance;
  rationale: string;
}

export interface RagHypothesisResponse {
  claim: string;
  verdict: HypothesisVerdict;
  confidence: 'high' | 'medium' | 'low' | string;
  summary: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  nuance: string[];
  perCitation: RagHypothesisCitation[];
  evidenceCounts: Record<HypothesisStance, number>;
  references: RagReference[];
  retrieval: RagRetrievalMeta;
  contexts?: RagContext[];
  error?: string;
}

export type ResearchPathCategory =
  | 'contradiction'
  | 'extension'
  | 'mechanism'
  | 'combination'
  | 'gap';

export type EvidenceLevel = 'high' | 'medium' | 'low';

export interface ResearchPathBuildsOn {
  citationNumber: number;
  contribution: string;
}

export interface ResearchPath {
  title: string;
  claim: string;
  rationale: string;
  category: ResearchPathCategory;
  buildsOn: ResearchPathBuildsOn[];
  openQuestion: string;
  suggestedApproach: string;
  whyNow: string;
  risks: string[];
  evidenceStrength: EvidenceLevel;
  impactEstimate: EvidenceLevel;
  selfRatedNovelty: EvidenceLevel;
  noveltyScore: number;
  convergenceScore: number;
  rationaleCitations: number[];
}

export interface RagProposeRequest {
  action: 'propose';
  topic?: string;
  namespace?: string;
  count?: number;
  topK?: number;
  citationStyle?: CitationStyle;
  returnContexts?: boolean;
  metadataFilter?: Record<string, unknown>;
}

export interface RagProposeResponse {
  topic: string;
  researchPaths: ResearchPath[];
  notes: string;
  references: RagReference[];
  retrieval: RagRetrievalMeta & {
    targetCount?: number;
    minCitationsPerPath?: number;
  };
  contexts?: RagContext[];
  error?: string;
}
