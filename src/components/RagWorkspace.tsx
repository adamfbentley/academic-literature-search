'use client';

import { useMemo, useState } from 'react';
import { Paper } from '@/types/paper';
import {
  RagAskRequest,
  CitationStyle,
  RagAskResponse,
  RagCorpusPaper,
  RagCorpusResponse,
  RagGapsResponse,
  RagHypothesisResponse,
  RagIngestRequest,
  RagIngestResponse,
  RagInsightsResponse,
  RagProposeResponse,
  RagSource,
  RagTask,
  ResearchPath,
} from '@/types/rag';

interface RagWorkspaceProps {
  papers: Paper[];
  bookmarks: Paper[];
  queuedPapers: Paper[];
  onClearQueuedPapers: () => void;
  onToast?: (message: string) => void;
}

const TASK_OPTIONS: RagTask[] = ['qa', 'synthesis', 'comparison', 'outline'];
const CITATION_STYLES: CitationStyle[] = ['apa', 'mla', 'ieee'];

function mapPaperForRag(paper: Paper): Paper {
  return {
    paperId: paper.paperId,
    title: paper.title,
    abstract: paper.abstract,
    authors: paper.authors,
    year: paper.year,
    citationCount: paper.citationCount,
    publicationDate: paper.publicationDate,
    venue: paper.venue,
    url: paper.url,
    pdfUrl: paper.pdfUrl,
    source: paper.source,
  };
}

export default function RagWorkspace({
  papers,
  bookmarks,
  queuedPapers,
  onClearQueuedPapers,
  onToast,
}: RagWorkspaceProps) {
  const [namespace, setNamespace] = useState('default');
  const [ingestQuery, setIngestQuery] = useState('');
  const [ingestLimit, setIngestLimit] = useState(8);
  const [extractPdfText, setExtractPdfText] = useState(false);
  const [chunkSizeWords, setChunkSizeWords] = useState(220);
  const [chunkOverlapWords, setChunkOverlapWords] = useState(40);
  const [minChunkWords, setMinChunkWords] = useState(60);
  const [timeBudgetSeconds, setTimeBudgetSeconds] = useState(24);
  const [queryPdfPaperLimit, setQueryPdfPaperLimit] = useState(2);
  const [sources, setSources] = useState<Record<RagSource, boolean>>({
    openalex: true,
    semantic_scholar: true,
    crossref: true,
  });

  const [loadingIngest, setLoadingIngest] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestResult, setIngestResult] = useState<RagIngestResponse | null>(null);

  const [question, setQuestion] = useState('');
  const [task, setTask] = useState<RagTask>('synthesis');
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('apa');
  const [topK, setTopK] = useState(8);
  const [returnContexts, setReturnContexts] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('');
  const [minYearFilter, setMinYearFilter] = useState('');

  const [loadingAsk, setLoadingAsk] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askResult, setAskResult] = useState<RagAskResponse | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insightsResult, setInsightsResult] = useState<RagInsightsResponse | null>(null);
  const [loadingGaps, setLoadingGaps] = useState(false);
  const [gapsError, setGapsError] = useState<string | null>(null);
  const [gapsResult, setGapsResult] = useState<RagGapsResponse | null>(null);

  const [corpusMaxPapers, setCorpusMaxPapers] = useState(50);
  const [corpusSort, setCorpusSort] = useState<'year' | 'citations' | 'title' | 'chunks'>('year');
  const [corpusSearch, setCorpusSearch] = useState('');
  const [loadingCorpus, setLoadingCorpus] = useState(false);
  const [corpusError, setCorpusError] = useState<string | null>(null);
  const [corpusResult, setCorpusResult] = useState<RagCorpusResponse | null>(null);

  const [claim, setClaim] = useState('');
  const [claimTopK, setClaimTopK] = useState(10);
  const [loadingHypothesis, setLoadingHypothesis] = useState(false);
  const [hypothesisError, setHypothesisError] = useState<string | null>(null);
  const [hypothesisResult, setHypothesisResult] = useState<RagHypothesisResponse | null>(null);

  const [proposeTopic, setProposeTopic] = useState('');
  const [proposeCount, setProposeCount] = useState(5);
  const [proposeTopK, setProposeTopK] = useState(15);
  const [loadingPropose, setLoadingPropose] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposeResult, setProposeResult] = useState<RagProposeResponse | null>(null);
  const [copiedPathIdx, setCopiedPathIdx] = useState<number | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  const selectedSources = useMemo(() => {
    return (Object.entries(sources) as Array<[RagSource, boolean]>)
      .filter(([, checked]) => checked)
      .map(([source]) => source);
  }, [sources]);

  const resolvedNamespace = namespace.trim() || 'default';

  const setSourceChecked = (source: RagSource, checked: boolean) => {
    setSources((prev) => ({ ...prev, [source]: checked }));
  };

  const postRag = async <T,>(payload: unknown): Promise<T> => {
    const response = await fetch(`${apiUrl}/rag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data: any = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || `RAG API error: ${response.status}`);
    }

    return data as T;
  };

  const ingestPapers = async (papersToIngest: Paper[], sourceLabel: string, clearQueue = false) => {
    if (!papersToIngest.length) {
      setIngestError(`No papers available in ${sourceLabel}.`);
      return;
    }

    setLoadingIngest(true);
    setIngestError(null);
    try {
      const payload: RagIngestRequest = {
        action: 'ingest',
        namespace: resolvedNamespace,
        papers: papersToIngest.map(mapPaperForRag),
        maxCandidates: Math.max(1, papersToIngest.length),
        extractPdfText,
        chunkSizeWords,
        chunkOverlapWords,
        minChunkWords,
        timeBudgetSeconds,
      };
      const result = await postRag<RagIngestResponse>(payload);
      setIngestResult(result);
      if (clearQueue) {
        onClearQueuedPapers();
      }
      onToast?.(`Ingested ${result.ingestedPapers} papers (${result.ingestedChunks} chunks)`);
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Failed to ingest papers');
    } finally {
      setLoadingIngest(false);
    }
  };

  const handleIngestFromQuery = async () => {
    if (!ingestQuery.trim()) {
      setIngestError('Enter a query to discover papers for ingestion.');
      return;
    }
    if (selectedSources.length === 0) {
      setIngestError('Select at least one source for query-based ingestion.');
      return;
    }

    setLoadingIngest(true);
    setIngestError(null);
    try {
      const payload: RagIngestRequest = {
        action: 'ingest',
        namespace: resolvedNamespace,
        query: ingestQuery.trim(),
        limit: ingestLimit,
        maxCandidates: ingestLimit,
        sources: selectedSources,
        extractPdfText,
        queryPdfPaperLimit,
        chunkSizeWords,
        chunkOverlapWords,
        minChunkWords,
        timeBudgetSeconds,
      };
      const result = await postRag<RagIngestResponse>(payload);
      setIngestResult(result);
      onToast?.(`Ingested ${result.ingestedPapers} papers (${result.ingestedChunks} chunks)`);
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Failed to ingest query results');
    } finally {
      setLoadingIngest(false);
    }
  };

  const buildMetadataFilter = () => {
    const metadataFilter: Record<string, any> = {};
    if (sourceFilter.trim()) {
      metadataFilter.source = sourceFilter.trim();
    }
    if (minYearFilter.trim()) {
      const parsed = Number(minYearFilter);
      if (!Number.isNaN(parsed)) {
        metadataFilter.year = { '$gte': parsed };
      }
    }
    return metadataFilter;
  };

  const handleAsk = async () => {
    if (!question.trim()) {
      setAskError('Enter a corpus question.');
      return;
    }
    const metadataFilter = buildMetadataFilter();

    setLoadingAsk(true);
    setAskError(null);
    try {
      const payload: RagAskRequest = {
        action: 'ask',
        question: question.trim(),
        task,
        citationStyle,
        topK,
        namespace: resolvedNamespace,
        returnContexts,
      };
      if (Object.keys(metadataFilter).length > 0) {
        payload.metadataFilter = metadataFilter;
      }

      const result = await postRag<RagAskResponse>(payload);
      setAskResult(result);
      onToast?.('RAG answer generated');
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Failed to query corpus');
    } finally {
      setLoadingAsk(false);
    }
  };

  const handleInsights = async () => {
    if (!question.trim()) {
      setInsightsError('Enter a question or field/topic prompt for insights.');
      return;
    }
    const metadataFilter = buildMetadataFilter();
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      const payload: Record<string, unknown> = {
        action: 'insights',
        question: question.trim(),
        citationStyle,
        topK,
        namespace: resolvedNamespace,
        returnContexts,
      };
      if (Object.keys(metadataFilter).length > 0) {
        payload.metadataFilter = metadataFilter;
      }
      const result = await postRag<RagInsightsResponse>(payload);
      setInsightsResult(result);
      onToast?.('Cross-paper insights generated');
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'Failed to generate insights');
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleGaps = async () => {
    if (!question.trim()) {
      setGapsError('Enter a question to detect research gaps.');
      return;
    }
    const metadataFilter = buildMetadataFilter();
    setLoadingGaps(true);
    setGapsError(null);
    try {
      const payload: Record<string, unknown> = {
        action: 'gaps',
        question: question.trim(),
        citationStyle,
        topK,
        namespace: resolvedNamespace,
      };
      if (Object.keys(metadataFilter).length > 0) {
        payload.metadataFilter = metadataFilter;
      }
      const result = await postRag<RagGapsResponse>(payload);
      setGapsResult(result);
      onToast?.('Research gaps detected');
    } catch (err) {
      setGapsError(err instanceof Error ? err.message : 'Failed to detect research gaps');
    } finally {
      setLoadingGaps(false);
    }
  };

  const handleLoadCorpus = async () => {
    const metadataFilter = buildMetadataFilter();
    setLoadingCorpus(true);
    setCorpusError(null);
    try {
      const payload: Record<string, unknown> = {
        action: 'corpus',
        namespace: resolvedNamespace,
        maxPapers: corpusMaxPapers,
      };
      if (Object.keys(metadataFilter).length > 0) {
        payload.metadataFilter = metadataFilter;
      }
      const result = await postRag<RagCorpusResponse>(payload);
      setCorpusResult(result);
      onToast?.(`Loaded ${result.paperCount} papers from ${result.namespace}`);
    } catch (err) {
      setCorpusError(err instanceof Error ? err.message : 'Failed to load corpus');
    } finally {
      setLoadingCorpus(false);
    }
  };

  const handleHypothesis = async () => {
    if (!claim.trim()) {
      setHypothesisError('Enter a claim or hypothesis to test against the corpus.');
      return;
    }
    const metadataFilter = buildMetadataFilter();
    setLoadingHypothesis(true);
    setHypothesisError(null);
    try {
      const payload: Record<string, unknown> = {
        action: 'hypothesis',
        claim: claim.trim(),
        namespace: resolvedNamespace,
        topK: claimTopK,
        citationStyle,
      };
      if (Object.keys(metadataFilter).length > 0) {
        payload.metadataFilter = metadataFilter;
      }
      const result = await postRag<RagHypothesisResponse>(payload);
      setHypothesisResult(result);
      onToast?.(`Hypothesis verdict: ${result.verdict}`);
    } catch (err) {
      setHypothesisError(err instanceof Error ? err.message : 'Failed to evaluate hypothesis');
    } finally {
      setLoadingHypothesis(false);
    }
  };

  const handlePropose = async () => {
    const metadataFilter = buildMetadataFilter();
    setLoadingPropose(true);
    setProposeError(null);
    try {
      const payload: Record<string, unknown> = {
        action: 'propose',
        namespace: resolvedNamespace,
        count: proposeCount,
        topK: proposeTopK,
        citationStyle,
      };
      if (proposeTopic.trim()) {
        payload.topic = proposeTopic.trim();
      }
      if (Object.keys(metadataFilter).length > 0) {
        payload.metadataFilter = metadataFilter;
      }
      const result = await postRag<RagProposeResponse>(payload);
      setProposeResult(result);
      onToast?.(`Generated ${result.researchPaths.length} research paths`);
    } catch (err) {
      setProposeError(err instanceof Error ? err.message : 'Failed to generate research paths');
    } finally {
      setLoadingPropose(false);
    }
  };

  const formatResearchPathAsMarkdown = (path: ResearchPath, references: { citationNumber: number; formatted: string }[]): string => {
    const cited = new Set(path.rationaleCitations.concat(path.buildsOn.map((b) => b.citationNumber)));
    const usedRefs = references.filter((r) => cited.has(r.citationNumber));
    const lines: string[] = [];
    lines.push(`# Research Path: ${path.title}`);
    lines.push('');
    lines.push(`**Hypothesis / claim:** ${path.claim}`);
    lines.push('');
    lines.push(`**Category:** ${path.category}`);
    lines.push(`**Evidence strength:** ${path.evidenceStrength} · **Estimated impact:** ${path.impactEstimate} · **Novelty:** ${path.noveltyScore.toFixed(2)} · **Convergence:** ${path.convergenceScore.toFixed(2)}`);
    lines.push('');
    lines.push(`**Rationale:** ${path.rationale}`);
    lines.push('');
    if (path.openQuestion) {
      lines.push(`**Open question:** ${path.openQuestion}`);
      lines.push('');
    }
    if (path.suggestedApproach) {
      lines.push(`**Suggested approach:** ${path.suggestedApproach}`);
      lines.push('');
    }
    if (path.whyNow) {
      lines.push(`**Why now:** ${path.whyNow}`);
      lines.push('');
    }
    if (path.buildsOn.length > 0) {
      lines.push('**Builds on:**');
      for (const b of path.buildsOn) {
        lines.push(`- [${b.citationNumber}] ${b.contribution}`);
      }
      lines.push('');
    }
    if (path.risks.length > 0) {
      lines.push('**Risks to investigate:**');
      for (const r of path.risks) lines.push(`- ${r}`);
      lines.push('');
    }
    if (usedRefs.length > 0) {
      lines.push('**References:**');
      for (const r of usedRefs) {
        lines.push(`- [${r.citationNumber}] ${r.formatted}`);
      }
    }
    return lines.join('\n');
  };

  const copyResearchPath = async (path: ResearchPath, idx: number) => {
    if (!proposeResult) return;
    const md = formatResearchPathAsMarkdown(path, proposeResult.references);
    try {
      await navigator.clipboard.writeText(md);
      setCopiedPathIdx(idx);
      setTimeout(() => setCopiedPathIdx((cur) => (cur === idx ? null : cur)), 2000);
      onToast?.('Research path copied as markdown');
    } catch {
      onToast?.('Failed to copy');
    }
  };

  const sortedCorpusPapers: RagCorpusPaper[] = useMemo(() => {
    if (!corpusResult) return [];
    const filter = corpusSearch.trim().toLowerCase();
    const filtered = filter
      ? corpusResult.papers.filter((p) => {
          const haystack = [
            p.title,
            p.methodology,
            p.modelType,
            p.datasetSize,
            p.keyFindings,
            p.limitations,
            p.authors.join(' '),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(filter);
        })
      : corpusResult.papers;
    const copy = [...filtered];
    copy.sort((a, b) => {
      switch (corpusSort) {
        case 'citations':
          return (b.citationCount || 0) - (a.citationCount || 0);
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'chunks':
          return (b.chunkCount || 0) - (a.chunkCount || 0);
        case 'year':
        default:
          return (b.year || 0) - (a.year || 0);
      }
    });
    return copy;
  }, [corpusResult, corpusSearch, corpusSort]);

  const copyReferences = async () => {
    if (!askResult || !askResult.references.length) {
      return;
    }
    const text = askResult.references.map((x) => x.formatted).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      onToast?.(`${askResult.references.length} references copied`);
    } catch {
      onToast?.('Failed to copy references');
    }
  };

  return (
    <section className="mt-8 animate-fade-in-up">
      <div className="glass rounded-2xl shadow-glass overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-primary-400 via-accent-400 to-neon-blue" />
        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4 mb-5">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2.5 mb-1">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-800 border border-slate-700/50 text-sm">🧠</span>
                RAG Workspace
              </h3>
              <p className="text-sm text-slate-600">
                Build a corpus, then run grounded QA/synthesis with automatic citations.
              </p>
            </div>
            <div className="w-full lg:w-72">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Namespace
              </label>
              <input
                type="text"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-sm"
                placeholder="default"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="rounded-xl border border-slate-700/50 bg-surface-900/35 p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-white">Corpus Ingestion</h4>
                <p className="text-xs text-slate-600 mt-1">Ingest search results, reading list, queue, or discover new papers by query.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => ingestPapers(papers, 'search results')}
                  disabled={loadingIngest || papers.length === 0}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-surface-800 border border-slate-700/60 text-slate-300 hover:text-primary-300 hover:border-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Ingest Results ({papers.length})
                </button>
                <button
                  onClick={() => ingestPapers(bookmarks, 'reading list')}
                  disabled={loadingIngest || bookmarks.length === 0}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-surface-800 border border-slate-700/60 text-slate-300 hover:text-primary-300 hover:border-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Ingest Reading List ({bookmarks.length})
                </button>
                <button
                  onClick={() => ingestPapers(queuedPapers, 'corpus queue', true)}
                  disabled={loadingIngest || queuedPapers.length === 0}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-surface-800 border border-slate-700/60 text-slate-300 hover:text-primary-300 hover:border-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Ingest Queue ({queuedPapers.length})
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Discover + Ingest
                </label>
                <input
                  type="text"
                  value={ingestQuery}
                  onChange={(e) => setIngestQuery(e.target.value)}
                  placeholder="e.g. retrieval-augmented generation evaluation"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-sm"
                />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Limit</label>
                    <input
                      type="number"
                      value={ingestLimit}
                      onChange={(e) => setIngestLimit(Number(e.target.value))}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Chunk size</label>
                    <input
                      type="number"
                      value={chunkSizeWords}
                      onChange={(e) => setChunkSizeWords(Number(e.target.value))}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Overlap</label>
                    <input
                      type="number"
                      value={chunkOverlapWords}
                      onChange={(e) => setChunkOverlapWords(Number(e.target.value))}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Min chunk</label>
                    <input
                      type="number"
                      value={minChunkWords}
                      onChange={(e) => setMinChunkWords(Number(e.target.value))}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                    />
                  </div>
                </div>

                <div className="w-full sm:w-44">
                  <label className="block text-[11px] text-slate-600 mb-1">Time budget (sec)</label>
                  <input
                    type="number"
                    value={timeBudgetSeconds}
                    onChange={(e) => setTimeBudgetSeconds(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  />
                </div>

                <div className="w-full sm:w-44">
                  <label className="block text-[11px] text-slate-600 mb-1">Query PDF papers</label>
                  <input
                    type="number"
                    value={queryPdfPaperLimit}
                    onChange={(e) => setQueryPdfPaperLimit(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                    <input type="checkbox" checked={sources.openalex} onChange={(e) => setSourceChecked('openalex', e.target.checked)} />
                    OpenAlex
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                    <input type="checkbox" checked={sources.semantic_scholar} onChange={(e) => setSourceChecked('semantic_scholar', e.target.checked)} />
                    Semantic Scholar
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                    <input type="checkbox" checked={sources.crossref} onChange={(e) => setSourceChecked('crossref', e.target.checked)} />
                    Crossref
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-400">
                    <input type="checkbox" checked={extractPdfText} onChange={(e) => setExtractPdfText(e.target.checked)} />
                    Extract PDF text
                  </label>
                </div>

                <button
                  onClick={handleIngestFromQuery}
                  disabled={loadingIngest}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-500 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loadingIngest ? 'Ingesting…' : 'Ingest From Query'}
                </button>

                <p className="text-[11px] text-slate-600">
                  Tip: API Gateway times out around 29s. Query-based PDF extraction is capped to a small number of papers; increase “Query PDF papers” carefully.
                </p>
              </div>

              {ingestError && (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-sm text-red-400">
                  {ingestError}
                </div>
              )}

              {ingestResult && (
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <p className="text-sm text-emerald-300">
                    Ingested <strong>{ingestResult.ingestedPapers}</strong> papers and <strong>{ingestResult.ingestedChunks}</strong> chunks into <code>{ingestResult.namespace}</code>.
                  </p>
                  <p className="text-xs text-slate-500">
                    Candidates: {ingestResult.candidateCount ?? '-'} · Discovered: {ingestResult.discoveredCount ?? '-'} · Model: {ingestResult.embeddingModel || 'unknown'}
                  </p>
                  {(ingestResult.truncatedCandidates ?? 0) > 0 && (
                    <p className="text-xs text-amber-400">
                      Deferred {ingestResult.truncatedCandidates} candidates due to ingest cap ({ingestResult.selectedCandidateCount ?? '?'} selected).
                    </p>
                  )}
                  {ingestResult.timedOut && (
                    <p className="text-xs text-amber-400">
                      Ingest hit time budget ({ingestResult.timeBudgetSeconds ?? '?'}s). Some papers were deferred; rerun with smaller limits for full coverage.
                    </p>
                  )}
                  {!!ingestResult.pdfExtractionDisabledReason && (
                    <p className="text-xs text-slate-500">
                      {ingestResult.pdfExtractionDisabledReason}
                    </p>
                  )}
                  {(ingestResult.queryPdfExtractionSelected ?? 0) > 0 && (
                    <p className="text-xs text-slate-500">
                      Query PDF extraction selected {ingestResult.queryPdfExtractionSelected} paper(s).
                    </p>
                  )}
                  {ingestResult.failedPapers.length > 0 && (
                    <p className="text-xs text-amber-400">Failed papers: {ingestResult.failedPapers.length}</p>
                  )}
                  {ingestResult.skippedPapers.length > 0 && (
                    <p className="text-xs text-slate-500">Skipped papers: {ingestResult.skippedPapers.length}</p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-700/50 bg-surface-900/35 p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-white">Ask Corpus</h4>
                <p className="text-xs text-slate-600 mt-1">Ask grounded questions and receive synthesis with formatted references.</p>
              </div>

              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                placeholder="Ask a cross-paper question..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-sm"
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Task</label>
                  <select
                    value={task}
                    onChange={(e) => setTask(e.target.value as RagTask)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  >
                    {TASK_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Citation style</label>
                  <select
                    value={citationStyle}
                    onChange={(e) => setCitationStyle(e.target.value as CitationStyle)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  >
                    {CITATION_STYLES.map((style) => (
                      <option key={style} value={style}>{style.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Top K</label>
                  <input
                    type="number"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Min year filter</label>
                  <input
                    type="number"
                    value={minYearFilter}
                    onChange={(e) => setMinYearFilter(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                    placeholder="optional"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-[11px] text-slate-600 mb-1">Source filter</label>
                  <input
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                    placeholder="e.g. OpenAlex"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-400 pt-5">
                  <input type="checkbox" checked={returnContexts} onChange={(e) => setReturnContexts(e.target.checked)} />
                  Return contexts
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleAsk}
                  disabled={loadingAsk}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-accent-600 to-accent-700 text-white hover:from-accent-500 hover:to-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loadingAsk ? 'Generating…' : 'Run RAG Query'}
                </button>
                <button
                  onClick={handleInsights}
                  disabled={loadingInsights}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-500 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loadingInsights ? 'Mapping…' : 'Field Map'}
                </button>
                <button
                  onClick={handleGaps}
                  disabled={loadingGaps}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-600 to-amber-700 text-white hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loadingGaps ? 'Detecting…' : 'Detect Gaps'}
                </button>
              </div>

              {askError && (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-sm text-red-400">
                  {askError}
                </div>
              )}
              {insightsError && (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-sm text-red-400">
                  {insightsError}
                </div>
              )}
              {gapsError && (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-sm text-red-400">
                  {gapsError}
                </div>
              )}

              {askResult && (
                <div className="space-y-3 pt-2 border-t border-slate-800/70">
                  <p className="text-xs text-slate-600">
                    {askResult.retrieval.returned} chunks · topK {askResult.retrieval.topK} · {askResult.retrieval.namespace}
                    {askResult.retrieval.embeddingModel ? ` · ${askResult.retrieval.embeddingModel}` : ''}
                    {askResult.retrieval.chatModel ? ` · ${askResult.retrieval.chatModel}` : ''}
                  </p>

                  <div className="p-3 rounded-xl bg-surface-850/50 border border-slate-700/40">
                    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{askResult.answer}</p>
                  </div>

                  {askResult.crossPaperSynthesis.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Cross-Paper Synthesis</h5>
                      <ul className="space-y-1.5">
                        {askResult.crossPaperSynthesis.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-400 flex gap-2">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {askResult.limitations.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">Limitations</h5>
                      <ul className="space-y-1">
                        {askResult.limitations.map((item, idx) => (
                          <li key={idx} className="text-xs text-slate-500">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {askResult.nextQuestions.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Next Questions</h5>
                      <div className="flex flex-wrap gap-2">
                        {askResult.nextQuestions.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => setQuestion(item)}
                            className="px-2.5 py-1.5 rounded-lg text-xs bg-surface-800 border border-slate-700/60 text-slate-400 hover:text-primary-300 hover:border-primary-500/30 transition-all"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600">References</h5>
                      <button
                        onClick={copyReferences}
                        className="text-xs px-2.5 py-1 rounded-lg bg-surface-800 border border-slate-700/60 text-slate-400 hover:text-primary-300 hover:border-primary-500/30 transition-all"
                      >
                        Copy
                      </button>
                    </div>
                    <ol className="space-y-2">
                      {askResult.references.map((ref) => (
                        <li key={ref.citationNumber} className="text-xs text-slate-500">
                          [{ref.citationNumber}] {ref.formatted}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {askResult.contexts && askResult.contexts.length > 0 && (
                    <details className="rounded-xl border border-slate-700/50 bg-surface-850/40 p-3">
                      <summary className="cursor-pointer text-xs text-slate-500">Retrieved contexts ({askResult.contexts.length})</summary>
                      <div className="mt-2 space-y-2">
                        {askResult.contexts.map((ctx, idx) => (
                          <div key={idx} className="p-2 rounded-lg bg-surface-900/60 border border-slate-800/60">
                            <p className="text-[11px] text-slate-600 mb-1">
                              Rank {ctx.rank} · Citation {ctx.citationNumber ?? '?'} · Score {ctx.score?.toFixed(4)}
                            </p>
                            <p className="text-xs text-slate-500">{ctx.snippet}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {insightsResult && (
                <div className="space-y-3 pt-2 border-t border-slate-800/70">
                  <p className="text-xs text-slate-600">
                    Insights: {insightsResult.retrieval.returned} chunks · topK {insightsResult.retrieval.topK} · {insightsResult.retrieval.namespace}
                    {insightsResult.retrieval.mode ? ` · ${insightsResult.retrieval.mode}` : ''}
                  </p>
                  {insightsResult.insights.agreementClusters.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Agreement Clusters</h5>
                      <ul className="space-y-1">
                        {insightsResult.insights.agreementClusters.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-400">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {insightsResult.insights.contradictions.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">Contradictions</h5>
                      <ul className="space-y-1">
                        {insightsResult.insights.contradictions.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-400">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {insightsResult.insights.methodologicalDifferences.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Methodological Differences</h5>
                      <ul className="space-y-1">
                        {insightsResult.insights.methodologicalDifferences.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-400">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {insightsResult.insights.timelineEvolution.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Timeline Evolution</h5>
                      <ul className="space-y-1">
                        {insightsResult.insights.timelineEvolution.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-400">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {insightsResult.insights.researchGaps.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">Research Gaps</h5>
                      <ul className="space-y-1">
                        {insightsResult.insights.researchGaps.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-400">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {gapsResult && (
                <div className="space-y-3 pt-2 border-t border-slate-800/70">
                  <p className="text-xs text-slate-600">
                    Gaps: {gapsResult.retrieval.returned} chunks · topK {gapsResult.retrieval.topK} · {gapsResult.retrieval.namespace}
                  </p>
                  {gapsResult.gaps.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">Detected Gaps</h5>
                      <ul className="space-y-1">
                        {gapsResult.gaps.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-400">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {gapsResult.supportingEvidence.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Supporting Evidence</h5>
                      <ul className="space-y-1">
                        {gapsResult.supportingEvidence.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-400">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hypothesis tester */}
          <div className="mt-5 rounded-xl border border-slate-700/50 bg-surface-900/35 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/15 text-amber-300 text-xs">⚖</span>
                  Hypothesis Tester
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Evaluate a claim against the ingested corpus — retrieves evidence FOR and AGAINST and returns a verdict.
                </p>
              </div>
              <div className="flex items-end gap-2">
                <div className="w-24">
                  <label className="block text-[11px] text-slate-600 mb-1">Top K</label>
                  <input
                    type="number"
                    value={claimTopK}
                    onChange={(e) => setClaimTopK(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  />
                </div>
                <button
                  onClick={handleHypothesis}
                  disabled={loadingHypothesis}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-amber-600 to-amber-700 text-white hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loadingHypothesis ? 'Testing…' : 'Test Hypothesis'}
                </button>
              </div>
            </div>

            <textarea
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              rows={2}
              placeholder='e.g. "Retrieval-augmented generation outperforms fine-tuning for domain QA."'
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-sm"
            />

            {hypothesisError && (
              <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-sm text-red-400">
                {hypothesisError}
              </div>
            )}

            {hypothesisResult && (
              <div className="space-y-3 pt-2 border-t border-slate-800/70">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
                    hypothesisResult.verdict === 'supported' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                    hypothesisResult.verdict === 'contradicted' ? 'bg-red-500/10 text-red-300 border-red-500/30' :
                    hypothesisResult.verdict === 'contested' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                    'bg-slate-500/10 text-slate-400 border-slate-500/30'
                  }`}>
                    Verdict: {hypothesisResult.verdict}
                  </span>
                  <span className="text-xs text-slate-500">Confidence: {hypothesisResult.confidence}</span>
                  <span className="text-xs text-slate-600">
                    {hypothesisResult.evidenceCounts.support} support · {hypothesisResult.evidenceCounts.contradict} contradict · {hypothesisResult.evidenceCounts.neutral} neutral · {hypothesisResult.evidenceCounts.insufficient} insufficient
                  </span>
                </div>

                {hypothesisResult.summary && (
                  <div className="p-3 rounded-xl bg-surface-850/50 border border-slate-700/40">
                    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{hypothesisResult.summary}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-2">Evidence FOR</h5>
                    {hypothesisResult.supportingEvidence.length > 0 ? (
                      <ul className="space-y-1.5">
                        {hypothesisResult.supportingEvidence.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-300">• {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-600 italic">No supporting evidence identified.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-red-300 mb-2">Evidence AGAINST</h5>
                    {hypothesisResult.contradictingEvidence.length > 0 ? (
                      <ul className="space-y-1.5">
                        {hypothesisResult.contradictingEvidence.map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-300">• {item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-600 italic">No contradicting evidence identified.</p>
                    )}
                  </div>
                </div>

                {hypothesisResult.nuance.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Nuance / Caveats</h5>
                    <ul className="space-y-1">
                      {hypothesisResult.nuance.map((item, idx) => (
                        <li key={idx} className="text-sm text-slate-400">• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {hypothesisResult.perCitation.length > 0 && (
                  <details className="rounded-xl border border-slate-700/50 bg-surface-850/40 p-3">
                    <summary className="cursor-pointer text-xs text-slate-500">
                      Per-citation classification ({hypothesisResult.perCitation.length})
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {hypothesisResult.perCitation.map((pc) => (
                        <div key={pc.citationNumber} className="text-xs text-slate-500 flex items-start gap-2">
                          <span className={`flex-shrink-0 inline-flex items-center justify-center w-12 text-[10px] font-semibold uppercase rounded ${
                            pc.stance === 'support' ? 'bg-emerald-500/15 text-emerald-300' :
                            pc.stance === 'contradict' ? 'bg-red-500/15 text-red-300' :
                            pc.stance === 'neutral' ? 'bg-slate-500/15 text-slate-400' :
                            'bg-amber-500/15 text-amber-300'
                          }`}>
                            {pc.stance}
                          </span>
                          <span className="text-slate-400">[{pc.citationNumber}]</span>
                          <span className="flex-1">{pc.rationale}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {hypothesisResult.references.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">References</h5>
                    <ol className="space-y-2">
                      {hypothesisResult.references.map((ref) => (
                        <li key={ref.citationNumber} className="text-xs text-slate-500">
                          [{ref.citationNumber}] {ref.formatted}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Methodology comparison table */}
          <div className="mt-5 rounded-xl border border-slate-700/50 bg-surface-900/35 p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary-500/15 text-primary-300 text-xs">▦</span>
                  Methodology Comparison
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Side-by-side view of structured fields extracted at ingest — methodology, dataset size, model type, key findings, limitations.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-32">
                  <label className="block text-[11px] text-slate-600 mb-1">Max papers</label>
                  <input
                    type="number"
                    value={corpusMaxPapers}
                    onChange={(e) => setCorpusMaxPapers(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  />
                </div>
                <div className="w-36">
                  <label className="block text-[11px] text-slate-600 mb-1">Sort by</label>
                  <select
                    value={corpusSort}
                    onChange={(e) => setCorpusSort(e.target.value as typeof corpusSort)}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  >
                    <option value="year">Year</option>
                    <option value="citations">Citations</option>
                    <option value="title">Title</option>
                    <option value="chunks">Chunk count</option>
                  </select>
                </div>
                <button
                  onClick={handleLoadCorpus}
                  disabled={loadingCorpus}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary-600 to-primary-700 text-white hover:from-primary-500 hover:to-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loadingCorpus ? 'Loading…' : (corpusResult ? 'Refresh' : 'Load Corpus')}
                </button>
              </div>
            </div>

            {corpusError && (
              <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-sm text-red-400">
                {corpusError}
              </div>
            )}

            {corpusResult && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-slate-600">
                    {sortedCorpusPapers.length} of {corpusResult.paperCount} papers
                    {corpusResult.truncated ? ` · truncated to maxPapers — increase to see more` : ''}
                    {' · '}namespace {corpusResult.namespace}
                  </p>
                  <input
                    value={corpusSearch}
                    onChange={(e) => setCorpusSearch(e.target.value)}
                    placeholder="Filter rows…"
                    className="ml-auto px-2.5 py-1.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-xs w-48"
                  />
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800/60">
                  <table className="min-w-full text-xs">
                    <thead className="bg-surface-850/60 text-slate-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Paper</th>
                        <th className="px-3 py-2 text-left font-semibold">Year</th>
                        <th className="px-3 py-2 text-left font-semibold">Citations</th>
                        <th className="px-3 py-2 text-left font-semibold">Methodology</th>
                        <th className="px-3 py-2 text-left font-semibold">Dataset</th>
                        <th className="px-3 py-2 text-left font-semibold">Model</th>
                        <th className="px-3 py-2 text-left font-semibold">Key findings</th>
                        <th className="px-3 py-2 text-left font-semibold">Limitations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {sortedCorpusPapers.map((p) => (
                        <tr key={p.paperId} className="hover:bg-surface-850/30">
                          <td className="px-3 py-2 align-top max-w-[260px]">
                            <div className="text-slate-300 font-medium leading-snug">
                              {p.url ? (
                                <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary-300">
                                  {p.title || '(untitled)'}
                                </a>
                              ) : (
                                p.title || '(untitled)'
                              )}
                            </div>
                            <div className="text-[10px] text-slate-600 mt-0.5 truncate">
                              {p.authors.slice(0, 3).join(', ')}{p.authors.length > 3 ? ` +${p.authors.length - 3}` : ''}
                              {p.venue ? ` · ${p.venue}` : ''}
                            </div>
                            {p.source && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 text-[10px]">{p.source}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-400">{p.year ?? '—'}</td>
                          <td className="px-3 py-2 align-top text-slate-400">{p.citationCount?.toLocaleString() ?? '0'}</td>
                          <td className="px-3 py-2 align-top text-slate-400 max-w-[200px]">{p.methodology || <span className="text-slate-700 italic">—</span>}</td>
                          <td className="px-3 py-2 align-top text-slate-400 max-w-[140px]">{p.datasetSize || <span className="text-slate-700 italic">—</span>}</td>
                          <td className="px-3 py-2 align-top text-slate-400 max-w-[140px]">{p.modelType || <span className="text-slate-700 italic">—</span>}</td>
                          <td className="px-3 py-2 align-top text-slate-400 max-w-[260px]">{p.keyFindings || <span className="text-slate-700 italic">—</span>}</td>
                          <td className="px-3 py-2 align-top text-slate-400 max-w-[200px]">{p.limitations || <span className="text-slate-700 italic">—</span>}</td>
                        </tr>
                      ))}
                      {sortedCorpusPapers.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-3 py-6 text-center text-slate-600">
                            {corpusSearch ? 'No papers match the filter.' : 'Corpus is empty — ingest some papers above first.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Research Paths */}
          <div className="mt-5 rounded-xl border border-slate-700/50 bg-surface-900/35 p-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-accent-500 to-primary-500 text-white text-xs">✦</span>
                  Research Paths
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  Identify high-probability research directions grounded in the ingested corpus. Every proposal requires at least 2 supporting citations.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-24">
                  <label className="block text-[11px] text-slate-600 mb-1">Count</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={proposeCount}
                    onChange={(e) => setProposeCount(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-[11px] text-slate-600 mb-1">Top K</label>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={proposeTopK}
                    onChange={(e) => setProposeTopK(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white text-sm focus-ring"
                  />
                </div>
                <button
                  onClick={handlePropose}
                  disabled={loadingPropose}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-accent-600 to-primary-600 text-white hover:from-accent-500 hover:to-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loadingPropose ? 'Generating…' : (proposeResult ? 'Regenerate' : 'Generate Paths')}
                </button>
              </div>
            </div>

            <input
              value={proposeTopic}
              onChange={(e) => setProposeTopic(e.target.value)}
              placeholder="Optional focus topic (leave blank to use the whole corpus)…"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-sm"
            />

            {proposeError && (
              <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-sm text-red-400">
                {proposeError}
              </div>
            )}

            {proposeResult && (
              <div className="space-y-3 pt-2 border-t border-slate-800/70">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span>
                    {proposeResult.researchPaths.length} paths · namespace {proposeResult.retrieval.namespace} · {proposeResult.retrieval.returned} chunks retrieved
                  </span>
                  {proposeResult.error && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[11px]">
                      {proposeResult.error}
                    </span>
                  )}
                </div>

                {proposeResult.notes && (
                  <p className="text-xs italic text-slate-500">{proposeResult.notes}</p>
                )}

                {proposeResult.researchPaths.length === 0 && !proposeResult.error && (
                  <div className="p-4 rounded-xl bg-surface-850/40 border border-slate-700/50 text-sm text-slate-500">
                    No paths met the evidence bar — try ingesting more papers or refining the focus topic.
                  </div>
                )}

                <div className="space-y-3">
                  {proposeResult.researchPaths.map((path, idx) => (
                    <div key={`${path.title}-${idx}`} className="rounded-xl border border-slate-700/50 bg-surface-850/40 p-4 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h5 className="text-sm font-semibold text-white leading-snug">{path.title}</h5>
                          <p className="text-sm text-slate-300 mt-1 leading-relaxed">{path.claim}</p>
                        </div>
                        <button
                          onClick={() => copyResearchPath(path, idx)}
                          className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-800 border border-slate-700/60 text-slate-400 hover:text-primary-300 hover:border-primary-500/30 transition-all"
                        >
                          {copiedPathIdx === idx ? 'Copied ✓' : 'Copy'}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider">
                        <span className="px-2 py-0.5 rounded bg-primary-500/15 text-primary-300 font-semibold">{path.category}</span>
                        <span className={`px-2 py-0.5 rounded font-semibold ${
                          path.evidenceStrength === 'high' ? 'bg-emerald-500/15 text-emerald-300' :
                          path.evidenceStrength === 'low' ? 'bg-amber-500/15 text-amber-300' :
                          'bg-slate-500/15 text-slate-400'
                        }`}>
                          evidence: {path.evidenceStrength}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-semibold ${
                          path.impactEstimate === 'high' ? 'bg-emerald-500/15 text-emerald-300' :
                          path.impactEstimate === 'low' ? 'bg-slate-500/15 text-slate-400' :
                          'bg-primary-500/15 text-primary-300'
                        }`}>
                          impact: {path.impactEstimate}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface-800 text-slate-500 font-mono normal-case">
                          novelty {path.noveltyScore.toFixed(2)}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface-800 text-slate-500 font-mono normal-case">
                          convergence {path.convergenceScore.toFixed(2)}
                        </span>
                      </div>

                      <div>
                        <h6 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Rationale</h6>
                        <p className="text-sm text-slate-400 leading-relaxed">{path.rationale}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {path.openQuestion && (
                          <div>
                            <h6 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Open question</h6>
                            <p className="text-xs text-slate-400">{path.openQuestion}</p>
                          </div>
                        )}
                        {path.suggestedApproach && (
                          <div>
                            <h6 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Suggested approach</h6>
                            <p className="text-xs text-slate-400">{path.suggestedApproach}</p>
                          </div>
                        )}
                        {path.whyNow && (
                          <div>
                            <h6 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Why now</h6>
                            <p className="text-xs text-slate-400">{path.whyNow}</p>
                          </div>
                        )}
                        {path.risks.length > 0 && (
                          <div>
                            <h6 className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-1">Risks</h6>
                            <ul className="space-y-0.5">
                              {path.risks.map((r, i) => (
                                <li key={i} className="text-xs text-slate-400">• {r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {path.buildsOn.length > 0 && (
                        <div>
                          <h6 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Builds on</h6>
                          <ul className="space-y-1">
                            {path.buildsOn.map((b) => (
                              <li key={b.citationNumber} className="text-xs text-slate-400">
                                <span className="text-primary-400 font-semibold">[{b.citationNumber}]</span> {b.contribution}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {proposeResult.references.length > 0 && (
                  <details className="rounded-xl border border-slate-700/50 bg-surface-850/40 p-3">
                    <summary className="cursor-pointer text-xs text-slate-500">
                      Corpus references ({proposeResult.references.length})
                    </summary>
                    <ol className="mt-2 space-y-1.5">
                      {proposeResult.references.map((ref) => (
                        <li key={ref.citationNumber} className="text-xs text-slate-500">
                          [{ref.citationNumber}] {ref.formatted}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
