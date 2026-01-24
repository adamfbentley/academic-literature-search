'use client';

import { useState } from 'react';

interface SearchBarProps {
  onSearch: (params: {
    query: string;
    limit: number;
    fromYear?: number;
    toYear?: number;
    minCitations?: number;
  }) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fromYear, setFromYear] = useState<string>('');
  const [toYear, setToYear] = useState<string>('');
  const [minCitations, setMinCitations] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      query,
      limit,
      fromYear: fromYear.trim() ? Number(fromYear) : undefined,
      toYear: toYear.trim() ? Number(toYear) : undefined,
      minCitations: minCitations.trim() ? Number(minCitations) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 border border-slate-200 dark:border-slate-700">
        <div className="space-y-4">
          {/* Search Input */}
          <div>
            <label
              htmlFor="search"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Search Query
            </label>
            <input
              id="search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter keywords (e.g., quantum computing, machine learning)"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={loading}
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Tips: use quotes for exact phrases (e.g. "quantum error correction"), add more keywords to narrow results.
            </p>
          </div>

          {/* Advanced Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            disabled={loading}
          >
            {showAdvanced ? '▼ Hide advanced filters' : '▶ Show advanced filters'}
          </button>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  From year
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={fromYear}
                  onChange={(e) => setFromYear(e.target.value)}
                  placeholder="e.g. 2020"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  To year
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={toYear}
                  onChange={(e) => setToYear(e.target.value)}
                  placeholder="e.g. 2025"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Min citations
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={minCitations}
                  onChange={(e) => setMinCitations(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          {/* Limit Selector */}
          <div className="flex items-center gap-4">
            <label
              htmlFor="limit"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Results:
            </label>
            <select
              id="limit"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={loading}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
            </select>

            {/* Search Button */}
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="ml-auto px-6 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
