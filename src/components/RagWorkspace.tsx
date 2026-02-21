'use client';

import { useMemo, useState } from 'react';
import { Paper } from '@/types/paper';
import {
  RagAskRequest,
  CitationStyle,
  RagAskResponse,
  RagGapsResponse,
  RagIngestRequest,
  RagIngestResponse,
  RagInsightsResponse,
  RagSource,
  RagTask,
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
        </div>
      </div>
    </section>
  );
}
