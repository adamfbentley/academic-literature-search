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
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-slate-800 dark:text-white mb-3 tracking-tight">
            Literature Review Assistant
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
            Search across disciplines with OpenAlex and Semantic Scholar, optionally include arXiv preprints,
            and generate research overviews.
          </p>
        </header>

        {/* Search Bar */}
        <SearchBar onSearch={handleSearch} loading={loading} />

        {/* Search Info */}
        {searchInfo && (
          <div className="mt-6 space-y-4">
            {/* Stats Bar */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">
                <span>
                  <strong>{searchInfo.count}</strong> papers found
                </span>
                {searchInfo.cached && (
                  <span className="text-green-600 dark:text-green-400">
                    ⚡ Cached results
                  </span>
                )}
                {searchInfo.sources && searchInfo.sources.length > 0 && (
                  <span>
                    Sources: <strong>{searchInfo.sources.join(', ')}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Research Overview (AI or fallback) */}
            {searchInfo.summary && (
              <div className="p-5 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                  🔬 Research Landscape Overview
                </h3>
                {searchInfo.cached && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Showing summary for cached papers (search is fast; summary may still be generated).
                  </p>
                )}
                
                {/* Overview */}
                <div className="mb-4">
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {searchInfo.summary.overview}
                  </p>
                </div>

                {/* Key Themes */}
                {searchInfo.summary.key_themes && searchInfo.summary.key_themes.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">📊 Key Research Themes:</h4>
                    <div className="flex flex-wrap gap-2">
                      {searchInfo.summary.key_themes.map((theme: string, idx: number) => (
                        <span key={idx} className="px-3 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-sm">
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Research Trends */}
                {searchInfo.summary.research_trends && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">📈 Research Trends:</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                      {searchInfo.summary.research_trends}
                    </p>
                  </div>
                )}

                {/* Emerging subtopics */}
                {searchInfo.summary.emerging_subtopics && searchInfo.summary.emerging_subtopics.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">🧭 Emerging Subtopics:</h4>
                    <div className="flex flex-wrap gap-2">
                      {searchInfo.summary.emerging_subtopics.map((t: string, idx: number) => (
                        <span key={idx} className="px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full text-sm">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Open questions */}
                {searchInfo.summary.open_questions && searchInfo.summary.open_questions.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">❓ Open Questions:</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {searchInfo.summary.open_questions.map((q: string, idx: number) => (
                        <li key={idx} className="text-sm text-slate-600 dark:text-slate-400">{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommended next queries */}
                {searchInfo.summary.recommended_next_queries && searchInfo.summary.recommended_next_queries.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">🔎 Recommended Next Queries:</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {searchInfo.summary.recommended_next_queries.map((q: string, idx: number) => (
                        <li key={idx} className="text-sm text-slate-600 dark:text-slate-400">{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Screening advice */}
                {searchInfo.summary.screening_advice && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">✅ Screening Advice:</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {searchInfo.summary.screening_advice}
                    </p>
                  </div>
                )}

                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                  {searchInfo.summary.top_cited && (
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Most Cited</div>
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {searchInfo.summary.top_cited.citations.toLocaleString()} citations
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {searchInfo.summary.top_cited.title.substring(0, 40)}...
                      </div>
                    </div>
                  )}
                  
                  {searchInfo.summary.date_range && (
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Date Range</div>
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {searchInfo.summary.date_range}
                      </div>
                    </div>
                  )}

                  {searchInfo.summary.total_citations !== undefined && (
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Total Citations</div>
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {searchInfo.summary.total_citations.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* In-Depth Overview (generated on demand) */}
            <div className="p-5 bg-white/70 dark:bg-slate-800/70 backdrop-blur rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    In-Depth Overview (1 page)
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Generates a dense, helpful one-page synthesis from the titles/abstracts of all papers returned in this search.
                  </p>
                </div>
                <button
                  onClick={handleGenerateDeepOverview}
                  disabled={loadingDeepOverview || !papers.length}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="This can take ~10-30s and uses OpenAI."
                >
                  {loadingDeepOverview ? 'Generating…' : deepOverview ? 'Regenerate In-Depth Overview' : 'Generate In-Depth Overview'}
                </button>
              </div>

              {deepOverviewError && (
                <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300">{deepOverviewError}</p>
                </div>
              )}

              {deepOverview && (
                <div className="mt-4 space-y-4">
                  {deepOverview._meta && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {deepOverview._meta.cached ? 'Returned from cache.' : 'Freshly generated.'}
                      {deepOverview._meta.model ? ` Model: ${deepOverview._meta.model}.` : ''}
                      {deepOverview._meta.papersUsed ? ` Papers used: ${deepOverview._meta.papersUsed}.` : ''}
                    </p>
                  )}
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {deepOverview.one_page_summary}
                  </p>

                  {Array.isArray(deepOverview.key_claims) && deepOverview.key_claims.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Key Claims</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {deepOverview.key_claims.map((x: string, idx: number) => (
                          <li key={idx} className="text-sm text-slate-600 dark:text-slate-400">{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(deepOverview.points_of_disagreement) && deepOverview.points_of_disagreement.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Points of Disagreement</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {deepOverview.points_of_disagreement.map((x: string, idx: number) => (
                          <li key={idx} className="text-sm text-slate-600 dark:text-slate-400">{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(deepOverview.recommended_reading_order) && deepOverview.recommended_reading_order.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Recommended Reading Order</h4>
                      <ol className="list-decimal list-inside space-y-1">
                        {deepOverview.recommended_reading_order.map((x: string, idx: number) => (
                          <li key={idx} className="text-sm text-slate-600 dark:text-slate-400">{x}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {Array.isArray(deepOverview.what_to_search_next) && deepOverview.what_to_search_next.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">What to Search Next</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {deepOverview.what_to_search_next.map((x: string, idx: number) => (
                          <li key={idx} className="text-sm text-slate-600 dark:text-slate-400">{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {deepOverview.limitations && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Limitations: {deepOverview.limitations}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mt-12">
            <LoadingSpinner />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <p className="text-red-600 dark:text-red-400">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && papers.length > 0 && (
          <div className="mt-8 space-y-4">
            {papers.map((paper, index) => (
              <PaperCard key={paper.paperId || index} paper={paper} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && papers.length === 0 && searchInfo === null && (
          <div className="mt-16 text-center text-slate-500 dark:text-slate-400">
            <svg
              className="mx-auto h-16 w-16 mb-4"
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
            <p className="text-lg">Start searching for academic papers</p>
            <p className="text-sm mt-2">
              Try &quot;quantum computing&quot;, &quot;machine learning&quot;, or &quot;climate change&quot;
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-16 pb-8 text-center text-sm text-slate-500 dark:text-slate-400">
        <p>Powered by OpenAlex, arXiv, and Semantic Scholar</p>
      </footer>
    </main>
  );
}
