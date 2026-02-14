'use client';

import { useState, useEffect, useCallback } from 'react';
import SearchBar from '@/components/SearchBar';
import PaperCard from '@/components/PaperCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Paper } from '@/types/paper';

// --- localStorage helpers ---
function loadBookmarks(): Paper[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('bookmarkedPapers') || '[]');
  } catch { return []; }
}
function saveBookmarks(papers: Paper[]) {
  localStorage.setItem('bookmarkedPapers', JSON.stringify(papers));
}
function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('searchHistory') || '[]');
  } catch { return []; }
}
function pushHistory(query: string) {
  const history = loadHistory().filter(q => q !== query);
  history.unshift(query);
  localStorage.setItem('searchHistory', JSON.stringify(history.slice(0, 12)));
}

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

  // --- New state ---
  const [bookmarks, setBookmarks] = useState<Paper[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Load bookmarks & history from localStorage on mount
  useEffect(() => {
    setBookmarks(loadBookmarks());
    setSearchHistory(loadHistory());
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string) => setToast(message);

  const toggleBookmark = useCallback((paper: Paper) => {
    setBookmarks(prev => {
      const exists = prev.some(p => (p.paperId && p.paperId === paper.paperId) || p.title === paper.title);
      let next: Paper[];
      if (exists) {
        next = prev.filter(p => !((p.paperId && p.paperId === paper.paperId) || p.title === paper.title));
        showToast('Removed from reading list');
      } else {
        next = [...prev, paper];
        showToast('Added to reading list');
      }
      saveBookmarks(next);
      return next;
    });
  }, []);

  const isBookmarked = useCallback((paper: Paper) => {
    return bookmarks.some(p => (p.paperId && p.paperId === paper.paperId) || p.title === paper.title);
  }, [bookmarks]);

  const exportBookmarksBibtex = () => {
    if (bookmarks.length === 0) { showToast('No papers saved'); return; }
    const bibtex = bookmarks.map((p, i) => {
      const key = p.paperId || `paper${i + 1}`;
      const author = p.authors?.join(' and ') || 'Unknown';
      const year = p.year || 'n.d.';
      return `@article{${key},\n  title={${p.title}},\n  author={${author}},\n  year={${year}},${p.venue ? `\n  journal={${p.venue}},` : ''}\n}`;
    }).join('\n\n');
    navigator.clipboard.writeText(bibtex).then(() => showToast(`${bookmarks.length} entries copied as BibTeX`));
  };

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

    // Save to history
    pushHistory(query.trim());
    setSearchHistory(loadHistory());

    setLoading(true);
    setError(null);
    setDeepOverview(null);
    setDeepOverviewError(null);
    setPapers([]);
    setSearchInfo(null);
    setLastSearchParams(params);
    setShowBookmarks(false);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit, fromYear, toYear, minCitations, sort, topic, includeArxiv }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...lastSearchParams,
          deepOverview: true,
          deepOverviewMaxPapers: Math.min(lastSearchParams.limit || 10, 20),
          forceRefresh: false,
          debug: true,
        }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      setDeepOverview(data.deep_overview || null);
      if (!data.deep_overview) setDeepOverviewError('No deep overview returned.');
    } catch (err) {
      setDeepOverviewError(err instanceof Error ? err.message : 'Failed to generate deep overview');
    } finally {
      setLoadingDeepOverview(false);
    }
  };

  return (
    <main className="min-h-screen bg-mesh bg-grid relative">
      {/* Decorative top gradient bar */}
      <div className="h-0.5 bg-gradient-to-r from-primary-400 via-accent-400 to-neon-blue animate-gradient bg-200%" />

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 toast">
          <div className="px-4 py-2.5 rounded-xl bg-surface-800/90 backdrop-blur border border-primary-500/20 shadow-glow text-sm text-primary-300 font-medium">
            {toast}
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-10 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-14 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 rounded-full bg-surface-800/60 border border-primary-500/20 text-sm text-primary-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
            </span>
            Multi-source academic search
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4">
            <span className="gradient-text">Literature Review</span>
            <br />
            <span className="text-white/90">Assistant</span>
          </h1>
          <p className="text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Search OpenAlex, Semantic Scholar &amp; arXiv.
            AI-powered summaries and research overviews.
          </p>
        </header>

        {/* Search Bar */}
        <div className="animate-fade-in-up">
          <SearchBar onSearch={handleSearch} loading={loading} />
        </div>

        {/* Search History */}
        {searchHistory.length > 0 && !searchInfo && !loading && (
          <div className="mt-5 flex flex-wrap items-center gap-2 animate-fade-in max-w-4xl mx-auto">
            <span className="text-xs text-slate-600 font-medium">Recent:</span>
            {searchHistory.slice(0, 6).map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSearch({ query: q, limit: 10 })}
                className="px-3 py-1 rounded-lg bg-surface-800/50 border border-slate-700/50 text-xs text-slate-400 hover:text-primary-400 hover:border-primary-500/30 transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Bookmarks toggle (always visible if bookmarks exist) */}
        {bookmarks.length > 0 && (
          <div className="mt-5 max-w-4xl mx-auto flex justify-end">
            <button
              onClick={() => setShowBookmarks(!showBookmarks)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-800/50 border border-slate-700/50 text-sm text-slate-400 hover:text-primary-400 hover:border-primary-500/30 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              Reading List
              <span className="px-1.5 py-0.5 rounded-md bg-primary-500/15 text-primary-400 text-xs font-bold">{bookmarks.length}</span>
            </button>
          </div>
        )}

        {/* Bookmarks panel */}
        {showBookmarks && bookmarks.length > 0 && (
          <div className="mt-4 max-w-4xl mx-auto animate-slide-down">
            <div className="glass rounded-2xl shadow-glass overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-accent-400 to-primary-400" />
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-primary-400" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                    Reading List
                  </h3>
                  <button
                    onClick={exportBookmarksBibtex}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-800/60 border border-slate-700/50 text-xs font-medium text-slate-400 hover:text-primary-400 hover:border-primary-500/30 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    Export BibTeX
                  </button>
                </div>
                <div className="space-y-2">
                  {bookmarks.map((paper, idx) => (
                    <div key={paper.paperId || idx} className="flex items-start gap-3 p-3 rounded-xl bg-surface-850/50 border border-slate-800/50 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-300 truncate">{paper.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {paper.authors?.slice(0, 3).join(', ')}{paper.year ? ` · ${paper.year}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleBookmark(paper)}
                        className="flex-shrink-0 p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Info */}
        {searchInfo && (
          <div className="mt-8 space-y-5 animate-fade-in-up">
            {/* Stats Bar */}
            <div className="glass rounded-2xl p-4 shadow-glass">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary-500/15 text-primary-400 text-xs font-bold">
                    {searchInfo.count}
                  </span>
                  papers found
                </div>
                {searchInfo.cached && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-500/10 text-accent-400 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Cached
                  </span>
                )}
                {searchInfo.sources && searchInfo.sources.length > 0 && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    {searchInfo.sources.map((src, idx) => (
                      <span key={idx} className="px-2.5 py-1 rounded-full bg-surface-800/60 border border-slate-700/40 text-slate-500 text-xs font-medium">
                        {src}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Research Overview */}
            {searchInfo.summary && (
              <div className="glass rounded-2xl shadow-glass overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-primary-400 via-accent-400 to-neon-blue" />
                <div className="p-6">
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2.5">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 text-white text-sm">🔬</span>
                    Research Landscape
                  </h3>
                  {searchInfo.cached && (
                    <p className="text-xs text-slate-600 mb-4">Summary from cached results.</p>
                  )}
                
                  <div className="mb-5">
                    <p className="text-slate-400 leading-relaxed">{searchInfo.summary.overview}</p>
                  </div>

                  {searchInfo.summary.key_themes && searchInfo.summary.key_themes.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">Key Themes</h4>
                      <div className="flex flex-wrap gap-2">
                        {searchInfo.summary.key_themes.map((theme: string, idx: number) => (
                          <span key={idx} className="tag-pill px-3 py-1.5 bg-primary-500/10 text-primary-400 rounded-lg text-sm font-medium border border-primary-500/20">
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchInfo.summary.research_trends && (
                    <div className="mb-5 pl-4 border-l-2 border-accent-500/30">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Trends</h4>
                      <p className="text-sm text-slate-500 italic leading-relaxed">{searchInfo.summary.research_trends}</p>
                    </div>
                  )}

                  {searchInfo.summary.emerging_subtopics && searchInfo.summary.emerging_subtopics.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">Emerging Subtopics</h4>
                      <div className="flex flex-wrap gap-2">
                        {searchInfo.summary.emerging_subtopics.map((t: string, idx: number) => (
                          <span key={idx} className="tag-pill px-3 py-1.5 bg-accent-500/10 text-accent-400 rounded-lg text-sm font-medium border border-accent-500/20">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchInfo.summary.open_questions && searchInfo.summary.open_questions.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">Open Questions</h4>
                      <ul className="space-y-2">
                        {searchInfo.summary.open_questions.map((q: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-slate-500">
                            <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs font-bold">?</span>
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {searchInfo.summary.recommended_next_queries && searchInfo.summary.recommended_next_queries.length > 0 && (
                    <div className="mb-5">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">Suggested Queries</h4>
                      <div className="flex flex-wrap gap-2">
                        {searchInfo.summary.recommended_next_queries.map((q: string, idx: number) => (
                          <button key={idx} onClick={() => handleSearch({ query: q, limit: 10 })} className="tag-pill px-3 py-1.5 bg-surface-800/60 text-slate-400 rounded-lg text-sm border border-slate-700/50 hover:text-primary-400 hover:border-primary-500/30 cursor-pointer transition-all">
                            → {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchInfo.summary.screening_advice && (
                    <div className="mb-5 p-3 rounded-xl bg-accent-500/5 border border-accent-500/15">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-accent-400 mb-1">Screening Advice</h4>
                      <p className="text-sm text-accent-300/80">{searchInfo.summary.screening_advice}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800/60">
                    {searchInfo.summary.top_cited && (
                      <div className="p-3 rounded-xl bg-surface-850/50">
                        <div className="text-xs font-medium text-slate-600 mb-0.5">Most Cited</div>
                        <div className="text-lg font-bold text-white">{searchInfo.summary.top_cited.citations.toLocaleString()}</div>
                        <div className="text-xs text-slate-600 truncate mt-0.5">{searchInfo.summary.top_cited.title.substring(0, 45)}…</div>
                      </div>
                    )}
                    {searchInfo.summary.date_range && (
                      <div className="p-3 rounded-xl bg-surface-850/50">
                        <div className="text-xs font-medium text-slate-600 mb-0.5">Date Range</div>
                        <div className="text-lg font-bold text-white">{searchInfo.summary.date_range}</div>
                      </div>
                    )}
                    {searchInfo.summary.total_citations !== undefined && (
                      <div className="p-3 rounded-xl bg-surface-850/50">
                        <div className="text-xs font-medium text-slate-600 mb-0.5">Total Citations</div>
                        <div className="text-lg font-bold text-white">{searchInfo.summary.total_citations.toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* In-Depth Overview */}
            <div className="glass rounded-2xl shadow-glass overflow-hidden">
              <div className="p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-800 border border-slate-700/50 text-sm">📄</span>
                      In-Depth Overview
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">Dense one-page synthesis from all returned papers.</p>
                  </div>
                  <button
                    onClick={handleGenerateDeepOverview}
                    disabled={loadingDeepOverview || !papers.length}
                    className="group px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-500 hover:to-primary-600 disabled:from-surface-800 disabled:to-surface-800 disabled:text-slate-600 disabled:cursor-not-allowed shadow-md hover:shadow-glow transition-all duration-200"
                  >
                    {loadingDeepOverview ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Generating…
                      </span>
                    ) : deepOverview ? 'Regenerate' : 'Generate Overview'}
                  </button>
                </div>

                {deepOverviewError && (
                  <div className="mt-3 p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                    <p className="text-sm text-red-400">{deepOverviewError}</p>
                  </div>
                )}

                {deepOverview && (
                  <div className="mt-5 space-y-5 animate-fade-in">
                    {deepOverview._meta && (
                      <p className="text-xs text-slate-600">
                        {deepOverview._meta.cached ? '⚡ From cache' : '✨ Freshly generated'}
                        {deepOverview._meta.model ? ` · ${deepOverview._meta.model}` : ''}
                        {deepOverview._meta.papersUsed ? ` · ${deepOverview._meta.papersUsed} papers` : ''}
                      </p>
                    )}
                    <p className="text-slate-400 leading-relaxed whitespace-pre-wrap">{deepOverview.one_page_summary}</p>

                    {Array.isArray(deepOverview.key_claims) && deepOverview.key_claims.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">Key Claims</h4>
                        <ul className="space-y-2">
                          {deepOverview.key_claims.map((x: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-slate-500">
                              <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary-400" />{x}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(deepOverview.points_of_disagreement) && deepOverview.points_of_disagreement.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">Points of Disagreement</h4>
                        <ul className="space-y-2">
                          {deepOverview.points_of_disagreement.map((x: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-slate-500">
                              <span className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400" />{x}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(deepOverview.recommended_reading_order) && deepOverview.recommended_reading_order.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">Recommended Reading Order</h4>
                        <ol className="space-y-2">
                          {deepOverview.recommended_reading_order.map((x: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-3 text-sm text-slate-500">
                              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-500/15 text-primary-400 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                              {x}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {Array.isArray(deepOverview.what_to_search_next) && deepOverview.what_to_search_next.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2.5">Search Next</h4>
                        <div className="flex flex-wrap gap-2">
                          {deepOverview.what_to_search_next.map((x: string, idx: number) => (
                            <button key={idx} onClick={() => handleSearch({ query: x, limit: 10 })} className="tag-pill px-3 py-1.5 rounded-lg bg-surface-800/60 text-slate-400 text-sm border border-slate-700/50 hover:text-primary-400 hover:border-primary-500/30 transition-all cursor-pointer">
                              → {x}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {deepOverview.limitations && (
                      <p className="text-xs text-slate-600 pt-3 border-t border-slate-800/60">⚠️ {deepOverview.limitations}</p>
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
          <div className="mt-8 p-5 rounded-2xl bg-red-500/5 border border-red-500/15 animate-fade-in">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center text-sm">✕</span>
              <p className="text-red-400 text-sm leading-relaxed">
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
                <PaperCard
                  paper={paper}
                  isBookmarked={isBookmarked(paper)}
                  onToggleBookmark={() => toggleBookmark(paper)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && papers.length === 0 && searchInfo === null && !showBookmarks && (
          <div className="mt-20 text-center animate-fade-in">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-surface-800/50 border border-slate-700/30 mb-6">
              <svg className="h-10 w-10 text-primary-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-xl font-semibold text-slate-400 mb-2">Start your literature search</p>
            <p className="text-sm text-slate-600 max-w-md mx-auto mb-4">
              Try &quot;quantum error correction&quot;, &quot;transformer architectures&quot;, or &quot;climate modelling&quot;
            </p>
            <p className="text-xs text-slate-700">
              Press <kbd>Ctrl</kbd> <kbd>K</kbd> to focus search
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-20 pb-10 text-center">
        <div className="flex items-center justify-center gap-3 text-xs text-slate-700">
          <span>Powered by</span>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-surface-800/60 border border-slate-800/50 font-medium text-slate-600">OpenAlex</span>
            <span className="px-2 py-0.5 rounded bg-surface-800/60 border border-slate-800/50 font-medium text-slate-600">Semantic Scholar</span>
            <span className="px-2 py-0.5 rounded bg-surface-800/60 border border-slate-800/50 font-medium text-slate-600">arXiv</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
