'use client';

import { useCallback, useEffect, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import PaperCard from '@/components/PaperCard';
import RagWorkspace from '@/components/RagWorkspace';
import SearchBar from '@/components/SearchBar';
import { Paper } from '@/types/paper';

type SearchParams = {
  query: string;
  limit: number;
  fromYear?: number;
  toYear?: number;
  minCitations?: number;
  sort?: 'relevance' | 'citations' | 'date';
  topic?: string;
  includeArxiv?: boolean;
  includeCrossref?: boolean;
};

function loadBookmarks(): Paper[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('bookmarkedPapers') || '[]');
  } catch {
    return [];
  }
}

function saveBookmarks(papers: Paper[]) {
  localStorage.setItem('bookmarkedPapers', JSON.stringify(papers));
}

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('searchHistory') || '[]');
  } catch {
    return [];
  }
}

function pushHistory(query: string) {
  const history = loadHistory().filter((q) => q !== query);
  history.unshift(query);
  localStorage.setItem('searchHistory', JSON.stringify(history.slice(0, 12)));
}

function loadCorpusQueue(): Paper[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('corpusQueuePapers') || '[]');
  } catch {
    return [];
  }
}

function saveCorpusQueue(papers: Paper[]) {
  localStorage.setItem('corpusQueuePapers', JSON.stringify(papers));
}

function BookmarkIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4.75A2.25 2.25 0 0 1 8.25 2.5h7.5A2.25 2.25 0 0 1 18 4.75v16l-6-3.25L6 20.75v-16Z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm-4 8V6a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800/75 bg-surface-950/40 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

export default function Home() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSearchParams, setLastSearchParams] = useState<SearchParams | null>(null);

  const [deepOverview, setDeepOverview] = useState<any | null>(null);
  const [loadingDeepOverview, setLoadingDeepOverview] = useState(false);
  const [deepOverviewError, setDeepOverviewError] = useState<string | null>(null);

  const [searchInfo, setSearchInfo] = useState<{
    count: number;
    cached: boolean;
    sources?: string[];
    summary?: any;
  } | null>(null);

  const [bookmarks, setBookmarks] = useState<Paper[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [corpusQueue, setCorpusQueue] = useState<Paper[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setBookmarks(loadBookmarks());
    setSearchHistory(loadHistory());
    setCorpusQueue(loadCorpusQueue());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (message: string) => setToast(message);

  const toggleBookmark = useCallback((paper: Paper) => {
    setBookmarks((prev) => {
      const exists = prev.some((p) => (p.paperId && p.paperId === paper.paperId) || p.title === paper.title);
      const next = exists
        ? prev.filter((p) => !((p.paperId && p.paperId === paper.paperId) || p.title === paper.title))
        : [...prev, paper];
      showToast(exists ? 'Removed from reading list' : 'Added to reading list');
      saveBookmarks(next);
      return next;
    });
  }, []);

  const isBookmarked = useCallback((paper: Paper) => {
    return bookmarks.some((p) => (p.paperId && p.paperId === paper.paperId) || p.title === paper.title);
  }, [bookmarks]);

  const toggleCorpusQueue = useCallback((paper: Paper) => {
    setCorpusQueue((prev) => {
      const exists = prev.some((p) => (p.paperId && p.paperId === paper.paperId) || p.title === paper.title);
      const next = exists
        ? prev.filter((p) => !((p.paperId && p.paperId === paper.paperId) || p.title === paper.title))
        : [...prev, paper];
      showToast(exists ? 'Removed from corpus queue' : 'Added to corpus queue');
      saveCorpusQueue(next);
      return next;
    });
  }, []);

  const isInCorpusQueue = useCallback((paper: Paper) => {
    return corpusQueue.some((p) => (p.paperId && p.paperId === paper.paperId) || p.title === paper.title);
  }, [corpusQueue]);

  const clearCorpusQueue = useCallback(() => {
    setCorpusQueue([]);
    saveCorpusQueue([]);
    showToast('Cleared corpus queue');
  }, []);

  const exportBookmarksBibtex = () => {
    if (bookmarks.length === 0) {
      showToast('No papers saved');
      return;
    }
    const bibtex = bookmarks.map((p, i) => {
      const key = p.paperId || `paper${i + 1}`;
      const author = p.authors?.join(' and ') || 'Unknown';
      const year = p.year || 'n.d.';
      return `@article{${key},\n  title={${p.title}},\n  author={${author}},\n  year={${year}},${p.venue ? `\n  journal={${p.venue}},` : ''}\n}`;
    }).join('\n\n');
    navigator.clipboard.writeText(bibtex).then(() => showToast(`${bookmarks.length} entries copied as BibTeX`));
  };

  const handleSearch = async (params: SearchParams) => {
    const { query, limit, fromYear, toYear, minCitations, sort, topic, includeArxiv, includeCrossref } = params;
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

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
        body: JSON.stringify({ query, limit, fromYear, toYear, minCitations, sort, topic, includeArxiv, includeCrossref }),
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

  const hasSessionContent = loading || error || papers.length > 0 || searchInfo !== null;

  return (
    <main className="min-h-screen bg-mesh bg-grid">
      <div className="h-1 bg-gradient-to-r from-primary-500 via-amber-400 to-accent-400" />

      {toast && (
        <div className="fixed right-4 top-4 z-50 toast sm:right-6 sm:top-6">
          <div className="rounded-xl border border-primary-500/20 bg-surface-850/95 px-4 py-2.5 text-sm font-medium text-primary-200 shadow-glow backdrop-blur">
            {toast}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr),360px] lg:items-end">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="status-pill border-primary-500/20 bg-primary-500/10 text-primary-300">
                Academic Literature AI
              </span>
              <span className="status-pill">OpenAlex</span>
              <span className="status-pill">Semantic Scholar</span>
              <span className="status-pill">Crossref</span>
            </div>
            <h1 className="text-4xl font-semibold text-white md:text-5xl">
              Research workspace
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">
              Search across academic indexes, screen relevant papers, and turn selected literature into a citation-grounded corpus.
            </p>
          </div>

          <div className="workspace-panel grid grid-cols-3 gap-2 p-3">
            <Metric label="Results" value={papers.length} />
            <Metric label="Saved" value={bookmarks.length} />
            <Metric label="Queued" value={corpusQueue.length} />
          </div>
        </header>

        <SearchBar onSearch={handleSearch} loading={loading} />

        {searchHistory.length > 0 && !searchInfo && !loading && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">Recent</span>
            {searchHistory.slice(0, 6).map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSearch({ query: q, limit: 10 })}
                className="secondary-action py-1.5 text-xs"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr),380px]">
          <div className="min-w-0">
            {loading && <LoadingSpinner />}

            {error && (
              <div className="workspace-panel border-red-500/20 bg-red-500/5 p-5">
                <p className="text-sm leading-6 text-red-300">
                  <strong className="font-semibold">Error:</strong> {error}
                </p>
              </div>
            )}

            {!loading && papers.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Search results</h2>
                    <p className="text-sm text-slate-500">
                      {searchInfo?.count ?? papers.length} papers returned
                      {searchInfo?.cached ? ' from cache' : ''}
                    </p>
                  </div>
                  {searchInfo?.sources && searchInfo.sources.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {searchInfo.sources.map((src) => (
                        <span key={src} className="status-pill">
                          {src}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {papers.map((paper, index) => (
                  <div
                    key={paper.paperId || index}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${Math.min(index * 0.03, 0.3)}s`, animationFillMode: 'both' }}
                  >
                    <PaperCard
                      paper={paper}
                      isBookmarked={isBookmarked(paper)}
                      onToggleBookmark={() => toggleBookmark(paper)}
                      isInCorpusQueue={isInCorpusQueue(paper)}
                      onToggleCorpusQueue={() => toggleCorpusQueue(paper)}
                    />
                  </div>
                ))}
              </div>
            )}

            {!hasSessionContent && !showBookmarks && (
              <div className="workspace-panel p-8 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-800 bg-surface-950/70 text-primary-300">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m21 21-5.2-5.2m1.7-4.55a6.25 6.25 0 1 1-12.5 0 6.25 6.25 0 0 1 12.5 0Z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white">Start with a topic</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                  Try a focused domain, method, or claim. The workspace keeps search results, saved papers, and corpus candidates together.
                </p>
              </div>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="workspace-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Reading list</h2>
                  <p className="text-sm text-slate-500">{bookmarks.length} saved papers</p>
                </div>
                <button
                  onClick={() => setShowBookmarks((value) => !value)}
                  disabled={bookmarks.length === 0}
                  className="secondary-action"
                >
                  <BookmarkIcon />
                  {showBookmarks ? 'Hide' : 'Show'}
                </button>
              </div>

              {showBookmarks && bookmarks.length > 0 && (
                <div className="mt-4 space-y-3 border-t border-slate-800/80 pt-4">
                  <button onClick={exportBookmarksBibtex} className="secondary-action w-full">
                    <CopyIcon />
                    Export BibTeX
                  </button>
                  <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                    {bookmarks.map((paper, idx) => (
                      <div key={paper.paperId || idx} className="rounded-xl border border-slate-800/70 bg-surface-950/40 p-3">
                        <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-200">{paper.title}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {paper.authors?.slice(0, 2).join(', ')}
                          {paper.year ? ` - ${paper.year}` : ''}
                        </p>
                        <button
                          onClick={() => toggleBookmark(paper)}
                          className="quiet-action mt-2 text-red-300 hover:text-red-200"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {searchInfo?.summary && (
              <div className="workspace-panel overflow-hidden">
                <div className="border-b border-slate-800/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-white">Research landscape</h2>
                      {searchInfo.cached && <p className="text-sm text-slate-500">Cached overview</p>}
                    </div>
                    <span className="status-pill border-primary-500/20 bg-primary-500/10 text-primary-300">
                      {searchInfo.count}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  {searchInfo.summary.overview && (
                    <p className="text-sm leading-6 text-slate-400">{searchInfo.summary.overview}</p>
                  )}

                  {searchInfo.summary.key_themes?.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-300">Themes</h3>
                      <div className="flex flex-wrap gap-2">
                        {searchInfo.summary.key_themes.map((theme: string, idx: number) => (
                          <span key={idx} className="status-pill border-primary-500/20 bg-primary-500/10 text-primary-300">
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchInfo.summary.research_trends && (
                    <div className="border-l border-accent-500/40 pl-3">
                      <h3 className="mb-1 text-sm font-semibold text-slate-300">Trends</h3>
                      <p className="text-sm leading-6 text-slate-500">{searchInfo.summary.research_trends}</p>
                    </div>
                  )}

                  {searchInfo.summary.open_questions?.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-300">Open questions</h3>
                      <ul className="space-y-2">
                        {searchInfo.summary.open_questions.map((q: string, idx: number) => (
                          <li key={idx} className="text-sm leading-6 text-slate-500">{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {searchInfo.summary.recommended_next_queries?.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-300">Next searches</h3>
                      <div className="flex flex-wrap gap-2">
                        {searchInfo.summary.recommended_next_queries.map((q: string, idx: number) => (
                          <button key={idx} onClick={() => handleSearch({ query: q, limit: 10 })} className="secondary-action py-1.5 text-xs">
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-4">
                    {searchInfo.summary.date_range && <Metric label="Date range" value={searchInfo.summary.date_range} />}
                    {searchInfo.summary.total_citations !== undefined && (
                      <Metric label="Citations" value={searchInfo.summary.total_citations.toLocaleString()} />
                    )}
                  </div>
                </div>
              </div>
            )}

            {searchInfo && (
              <div className="workspace-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-white">In-depth overview</h2>
                    <p className="text-sm leading-6 text-slate-500">Dense synthesis from returned papers.</p>
                  </div>
                  <button
                    onClick={handleGenerateDeepOverview}
                    disabled={loadingDeepOverview || !papers.length}
                    className="primary-action whitespace-nowrap px-3 py-2"
                  >
                    {loadingDeepOverview ? 'Generating' : deepOverview ? 'Regenerate' : 'Generate'}
                  </button>
                </div>

                {deepOverviewError && (
                  <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                    {deepOverviewError}
                  </div>
                )}

                {deepOverview && (
                  <div className="mt-4 space-y-4 border-t border-slate-800/80 pt-4">
                    {deepOverview._meta && (
                      <p className="text-xs text-slate-600">
                        {deepOverview._meta.cached ? 'From cache' : 'Fresh'}
                        {deepOverview._meta.model ? ` - ${deepOverview._meta.model}` : ''}
                        {deepOverview._meta.papersUsed ? ` - ${deepOverview._meta.papersUsed} papers` : ''}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-400">{deepOverview.one_page_summary}</p>

                    {Array.isArray(deepOverview.key_claims) && deepOverview.key_claims.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-slate-300">Key claims</h3>
                        <ul className="space-y-2">
                          {deepOverview.key_claims.map((x: string, idx: number) => (
                            <li key={idx} className="text-sm leading-6 text-slate-500">{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(deepOverview.points_of_disagreement) && deepOverview.points_of_disagreement.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-slate-300">Disagreements</h3>
                        <ul className="space-y-2">
                          {deepOverview.points_of_disagreement.map((x: string, idx: number) => (
                            <li key={idx} className="text-sm leading-6 text-slate-500">{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Array.isArray(deepOverview.what_to_search_next) && deepOverview.what_to_search_next.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold text-slate-300">Search next</h3>
                        <div className="flex flex-wrap gap-2">
                          {deepOverview.what_to_search_next.map((x: string, idx: number) => (
                            <button key={idx} onClick={() => handleSearch({ query: x, limit: 10 })} className="secondary-action py-1.5 text-xs">
                              {x}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </aside>
        </section>

        <RagWorkspace
          papers={papers}
          bookmarks={bookmarks}
          queuedPapers={corpusQueue}
          onClearQueuedPapers={clearCorpusQueue}
          onToast={showToast}
        />

        <footer className="mt-12 pb-8 text-center text-xs text-slate-700">
          OpenAlex / Semantic Scholar / Crossref / arXiv / Pinecone
        </footer>
      </div>
    </main>
  );
}
