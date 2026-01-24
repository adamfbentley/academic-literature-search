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
  const [searchInfo, setSearchInfo] = useState<{
    count: number;
    cached: boolean;
    sources?: string[];
  } | null>(null);

  const handleSearch = async (query: string, limit: number) => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError(null);
    setPapers([]);
    setSearchInfo(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, limit }),
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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch papers');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-slate-800 dark:text-white mb-3">
            Academic Literature Search
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            Search millions of academic papers from OpenAlex, arXiv, and Semantic Scholar
          </p>
        </header>

        {/* Search Bar */}
        <SearchBar onSearch={handleSearch} loading={loading} />

        {/* Search Info */}
        {searchInfo && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
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
