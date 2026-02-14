'use client';

import { useState } from 'react';
import SearchBar from '@/components/SearchBar';
import PaperCard from '@/components/PaperCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Paper } from '@/types/paper';

export default function Home() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSearchParams, setLastSearchParams] = useState<{
    query: string;
    limit: number;
    fromYear?: number;
    toYear?: number;
    minCitations?: number;
    sort?: 'relevance' | 'citations' | 'date';
    topic?: string;
    includeArxiv?: boolean;
  } | null>(null);

  const [deepOverview, setDeepOverview] = useState<any | null>(null);
  const [loadingDeepOverview, setLoadingDeepOverview] = useState(false);
  const [deepOverviewError, setDeepOverviewError] = useState<string | null>(null);

  const [searchInfo, setSearchInfo] = useState<{
    count: number;
    cached: boolean;
    sources?: string[];
    summary?: any;
  } | null>(null);

  const handleSearch = async (params: {
    query: string;
    limit: number;
    fromYear?: number;
    toYear?: number;
    minCitations?: number;
    sort?: 'relevance' | 'citations' | 'date';
    topic?: string;
    includeArxiv?: boolean;
  }) => {
    const { query, limit, fromYear, toYear, minCitations, sort, topic, includeArxiv } = params;
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError(null);
    setDeepOverview(null);
    setDeepOverviewError(null);
    setPapers([]);
    setSearchInfo(null);
    setLastSearchParams(params);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, limit, fromYear, toYear, minCitations, sort, topic, includeArxiv }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setPapers(data.papers || []);
      setSearchInfo({
        count: data.count,
        cached: data.cached,
        sources: data.sources,
        summary: data.summary,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch papers');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDeepOverview = async () => {
    if (!lastSearchParams) return;
    setLoadingDeepOverview(true);
    setDeepOverviewError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...lastSearchParams,
          deepOverview: true,
          deepOverviewMaxPapers: Math.min(lastSearchParams.limit || 10, 20),
          forceRefresh: false,
          debug: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setDeepOverview(data.deep_overview || null);
      if (!data.deep_overview) {
        setDeepOverviewError('No deep overview returned.');
      }
    } catch (err) {
      setDeepOverviewError(err instanceof Error ? err.message : 'Failed to generate deep overview');
      console.error('Deep overview error:', err);
    } finally {
      setLoadingDeepOverview(false);
    }
  };

  return (
    <main className="min-h-screen bg-mesh">
      {/* Decorative top gradient bar */}
      <div className="h-1 bg-gradient-to-r from-primary-500 via-accent-500 to-pink-500 animate-gradient bg-200%" />

      <div className="container mx-auto px-4 py-10 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-14 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 rounded-full bg-primary-50 dark:bg-primary-950/50 border border-primary-200 dark:border-primary-800 text-sm text-primary-700 dark:text-primary-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
            </span>
            Multi-source academic search
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4">
            <span className="gradient-text">Literature Review</span>
            <br />
            <span className="text-slate-800 dark:text-white">Assistant</span>
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Search across OpenAlex, Semantic Scholar &amp; arXiv.
            Generate AI-powered summaries and research overviews.
          </p>
        </header>

        {/* Search Bar */}
        <div className="animate-fade-in-up">
          <SearchBar onSearch={handleSearch} loading={loading} />
        </div>

        {/* Search Info */}
        {searchInfo && (
          <div className="mt-8 space-y-5 animate-fade-in-up">
            {/* Stats Bar */}
            <div className="glass rounded-2xl p-4 shadow-glass">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-xs font-bold">
                    {searchInfo.count}
                  </span>
                  papers found
                </div>
                {searchInfo.cached && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Cached
                  </span>
                )}
                {searchInfo.sources && searchInfo.sources.length > 0 && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    {searchInfo.sources.map((src, idx) => (
                      <span key={idx} className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium">
                        {src}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Research Overview (AI or fallback) */}
            {searchInfo.summary && (
              <div className="glass rounded-2xl shadow-glass overflow-hidden">
                {/* Gradient header strip */}
                <div className="h-1 bg-gradient-to-r from-primary-500 via-accent-500 to-pink-500" />
                <div className="p-6">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2.5">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 text-white text-sm">🔬</span>
                    Research Landscape
                  </h3>
                  {searchInfo.cached && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                      Summary from cached results — search is fast, summary may still be regenerating.
                    </p>
                  )}
                
                  {/* Overview */}
                  <div className="mb-5">
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {searchInfo.summary.overview}
                    </p>
                  </div>

                  {/* Key Themes */}
                  {searchInfo.summary.key_themes && searchInfo.summary.key_themes.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">Key Themes</h4>
                      <div className="flex flex-wrap gap-2">
                        {searchInfo.summary.key_themes.map((theme: string, idx: number) => (
                          <span key={idx} className="tag-pill px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-sm font-medium border border-primary-100 dark:border-primary-800/50">
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Research Trends */}
                  {searchInfo.summary.research_trends && (
                    <div className="mb-5 pl-4 border-l-2 border-accent-300 dark:border-accent-700">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">Trends</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400 italic leading-relaxed">
                        {searchInfo.summary.research_trends}
                      </p>
                    </div>
                  )}

                  {/* Emerging subtopics */}
                  {searchInfo.summary.emerging_subtopics && searchInfo.summary.emerging_subtopics.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">Emerging Subtopics</h4>
                      <div className="flex flex-wrap gap-2">
                        {searchInfo.summary.emerging_subtopics.map((t: string, idx: number) => (
                          <span key={idx} className="tag-pill px-3 py-1.5 bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300 rounded-lg text-sm font-medium border border-accent-100 dark:border-accent-800/50">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Open questions */}
                  {searchInfo.summary.open_questions && searchInfo.summary.open_questions.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">Open Questions</h4>
                      <ul className="space-y-2">
                        {searchInfo.summary.open_questions.map((q: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold">?</span>
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommended next queries */}
                  {searchInfo.summary.recommended_next_queries && searchInfo.summary.recommended_next_queries.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">Suggested Queries</h4>
                      <div className="flex flex-wrap gap-2">
                        {searchInfo.summary.recommended_next_queries.map((q: string, idx: number) => (
                          <span key={idx} className="tag-pill px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-sm border border-slate-200 dark:border-slate-700 cursor-default">
                            🔎 {q}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Screening advice */}
                  {searchInfo.summary.screening_advice && (
                    <div className="mb-5 p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-900/15 border border-emerald-200/50 dark:border-emerald-800/30">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">Screening Advice</h4>
                      <p className="text-sm text-emerald-700 dark:text-emerald-300">
                        {searchInfo.summary.screening_advice}
                      </p>
                    </div>
                  )}

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/40">
                    {searchInfo.summary.top_cited && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-0.5">Most Cited</div>
                        <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                          {searchInfo.summary.top_cited.citations.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                          {searchInfo.summary.top_cited.title.substring(0, 45)}…
                        </div>
                      </div>
                    )}
                    
                    {searchInfo.summary.date_range && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-0.5">Date Range</div>
                        <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                          {searchInfo.summary.date_range}
                        </div>
                      </div>
                    )}

                    {searchInfo.summary.total_citations !== undefined && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <div className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-0.5">Total Citations</div>
                        <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                          {searchInfo.summary.total_citations.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* In-Depth Overview (generated on demand) */}
            <div className="glass rounded-2xl shadow-glass overflow-hidden">
              <div className="p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-300 dark:to-slate-500 text-white dark:text-slate-900 text-sm">📄</span>
                      In-Depth Overview
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Dense one-page synthesis from titles &amp; abstracts of all returned papers.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerateDeepOverview}
                    disabled={loadingDeepOverview || !papers.length}
                    className="group relative px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-500 hover:to-primary-600 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-slate-700 dark:disabled:to-slate-800 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200"
                    title="This can take ~10-30s and uses OpenAI."
                  >
                    {loadingDeepOverview ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Generating…
                      </span>
                    ) : deepOverview ? 'Regenerate Overview' : 'Generate Overview'}
                  </button>
                </div>

                {deepOverviewError && (
                  <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/40">
                    <p className="text-sm text-red-600 dark:text-red-400">{deepOverviewError}</p>
                  </div>
                )}

                {deepOverview && (
                  <div className="mt-5 space-y-5 animate-fade-in">
                    {deepOverview._meta && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {deepOverview._meta.cached ? '⚡ From cache' : '✨ Freshly generated'}
                        {deepOverview._meta.model ? ` · ${deepOverview._meta.model}` : ''}
                        {deepOverview._meta.papersUsed ? ` · ${deepOverview._meta.papersUsed} papers` : ''}
                      </p>
                    )}
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {deepOverview.one_page_summary}
                    </p>

                    {Array.isArray(deepOverview.key_claims) && deepOverview.key_claims.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">Key Claims</h4>
                        <ul className="space-y-2">
                          {deepOverview.key_claims.map((x: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                              <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary-400" />
                              {x}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(deepOverview.points_of_disagreement) && deepOverview.points_of_disagreement.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">Points of Disagreement</h4>
                        <ul className="space-y-2">
                          {deepOverview.points_of_disagreement.map((x: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                              <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                              {x}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(deepOverview.recommended_reading_order) && deepOverview.recommended_reading_order.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">Recommended Reading Order</h4>
                        <ol className="space-y-2">
                          {deepOverview.recommended_reading_order.map((x: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                              {x}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {Array.isArray(deepOverview.what_to_search_next) && deepOverview.what_to_search_next.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5">Search Next</h4>
                        <div className="flex flex-wrap gap-2">
                          {deepOverview.what_to_search_next.map((x: string, idx: number) => (
                            <span key={idx} className="tag-pill px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm border border-slate-200 dark:border-slate-700">
                              → {x}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {deepOverview.limitations && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 pt-3 border-t border-slate-200/50 dark:border-slate-700/40">
                        ⚠️ {deepOverview.limitations}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mt-14 animate-fade-in">
            <LoadingSpinner />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mt-8 p-5 rounded-2xl bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/40 animate-fade-in">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-500 flex items-center justify-center text-sm">✕</span>
              <p className="text-red-700 dark:text-red-400 text-sm leading-relaxed">
                <strong className="font-semibold">Error:</strong> {error}
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {!loading && papers.length > 0 && (
          <div className="mt-10 space-y-5">
            {papers.map((paper, index) => (
              <div
                key={paper.paperId || index}
                className="animate-fade-in-up"
                style={{ animationDelay: `${Math.min(index * 0.05, 0.5)}s`, animationFillMode: 'both' }}
              >
                <PaperCard paper={paper} />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && papers.length === 0 && searchInfo === null && (
          <div className="mt-20 text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-100 to-accent-100 dark:from-primary-900/30 dark:to-accent-900/30 mb-6">
              <svg
                className="h-10 w-10 text-primary-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <p className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">Start your literature search</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 max-w-md mx-auto">
              Try &quot;quantum error correction&quot;, &quot;transformer architectures&quot;, or &quot;climate modelling&quot;
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-20 pb-10 text-center">
        <div className="flex items-center justify-center gap-3 text-xs text-slate-400 dark:text-slate-600">
          <span>Powered by</span>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium">OpenAlex</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium">Semantic Scholar</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium">arXiv</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
