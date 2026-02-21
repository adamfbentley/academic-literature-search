'use client';

import { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  onSearch: (params: {
    query: string;
    limit: number;
    fromYear?: number;
    toYear?: number;
    minCitations?: number;
    sort?: 'relevance' | 'citations' | 'date';
    topic?: string;
    includeArxiv?: boolean;
    includeCrossref?: boolean;
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
  const [sort, setSort] = useState<'relevance' | 'citations' | 'date'>('relevance');
  const [topic, setTopic] = useState<string>('');
  const [includeArxiv, setIncludeArxiv] = useState<boolean>(false);
  const [includeCrossref, setIncludeCrossref] = useState<boolean>(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      query,
      limit,
      fromYear: fromYear.trim() ? Number(fromYear) : undefined,
      toYear: toYear.trim() ? Number(toYear) : undefined,
      minCitations: minCitations.trim() ? Number(minCitations) : undefined,
      sort,
      topic: topic.trim() ? topic.trim() : undefined,
      includeArxiv,
      includeCrossref,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto">
      <div className="glass rounded-2xl shadow-glass hover:shadow-glass-lg transition-shadow duration-300 p-6">
        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <label
              htmlFor="search"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2"
            >
              Search Query
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                ref={inputRef}
                id="search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. quantum computing, machine learning, climate modelling…"
                className="w-full pl-12 pr-20 py-3.5 rounded-xl border border-slate-700/50 bg-surface-850/80 text-white placeholder-slate-500 focus-ring text-base"
                disabled={loading}
              />
              {/* Keyboard shortcut hint */}
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <span className="hidden sm:flex items-center gap-0.5 text-slate-600">
                  <kbd>Ctrl</kbd>
                  <kbd>K</kbd>
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Use quotes for exact phrases, e.g. &quot;quantum error correction&quot;
            </p>
          </div>

          {/* Advanced Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-primary-400 transition-colors"
            disabled={loading}
          >
            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdvanced ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
            Advanced filters
          </button>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl bg-surface-850/40 border border-slate-700/50 animate-slide-down">
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Topic / Concept
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. quantum error correction, surface codes"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-sm"
                  disabled={loading}
                />
                <p className="mt-1 text-xs text-slate-600">
                  Narrows via OpenAlex Concepts. Leave blank for keyword-only search.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Sort by
                </label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white focus-ring text-sm"
                  disabled={loading}
                >
                  <option value="relevance">Relevance</option>
                  <option value="citations">Citations</option>
                  <option value="date">Newest first</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  From year
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={fromYear}
                  onChange={(e) => setFromYear(e.target.value)}
                  placeholder="2020"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-sm"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  To year
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={toYear}
                  onChange={(e) => setToYear(e.target.value)}
                  placeholder="2026"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-sm"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Min citations
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={minCitations}
                  onChange={(e) => setMinCitations(e.target.value)}
                  placeholder="50"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700/50 bg-surface-900 text-white placeholder-slate-500 focus-ring text-sm"
                  disabled={loading}
                />
              </div>

              <div className="md:col-span-3 flex flex-wrap items-center gap-5 pt-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="includeArxiv"
                    type="checkbox"
                    checked={includeArxiv}
                    onChange={(e) => setIncludeArxiv(e.target.checked)}
                    className="sr-only peer"
                    disabled={loading}
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500"></div>
                  <span className="ml-2.5 text-sm text-slate-300">
                    Include arXiv preprints
                  </span>
                </label>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="includeCrossref"
                    type="checkbox"
                    checked={includeCrossref}
                    onChange={(e) => setIncludeCrossref(e.target.checked)}
                    className="sr-only peer"
                    disabled={loading}
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-500"></div>
                  <span className="ml-2.5 text-sm text-slate-300">
                    Include Crossref records
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Bottom Row */}
          <div className="flex items-center gap-4 pt-1">
            <label
              htmlFor="limit"
              className="text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Results
            </label>
            <select
              id="limit"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-slate-700/50 bg-surface-900 text-white focus-ring text-sm"
              disabled={loading}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={75}>75</option>
              <option value={100}>100</option>
            </select>

            {/* Search Button */}
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="ml-auto group relative px-7 py-2.5 font-semibold text-sm text-white rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-500 hover:to-primary-600 disabled:from-surface-800 disabled:to-surface-800 disabled:text-slate-600 disabled:cursor-not-allowed shadow-md hover:shadow-glow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-surface-950"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Searching…
                </span>
              ) : 'Search'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
