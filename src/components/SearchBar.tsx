'use client';

import { useEffect, useRef, useState } from 'react';

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

const sortOptions = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'citations', label: 'Citations' },
  { value: 'date', label: 'Newest' },
] as const;

function SearchIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-5.2-5.2m1.7-4.55a6.25 6.25 0 1 1-12.5 0 6.25 6.25 0 0 1 12.5 0Z" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h10m4 0h2M4 17h3m4 0h9M10 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm-3 10a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
    </svg>
  );
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fromYear, setFromYear] = useState('');
  const [toYear, setToYear] = useState('');
  const [minCitations, setMinCitations] = useState('');
  const [sort, setSort] = useState<'relevance' | 'citations' | 'date'>('relevance');
  const [topic, setTopic] = useState('');
  const [includeArxiv, setIncludeArxiv] = useState(false);
  const [includeCrossref, setIncludeCrossref] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <form onSubmit={handleSubmit} className="w-full">
      <div className="workspace-panel p-4 md:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label htmlFor="search" className="mb-2 block text-sm font-semibold text-slate-300">
                Search literature
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                  <SearchIcon />
                </div>
                <input
                  ref={inputRef}
                  id="search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="quantum error correction, LLM evaluation, climate modelling"
                  className="control-input w-full py-3.5 pl-12 pr-4 text-base"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-[minmax(96px,120px),1fr] gap-2 sm:flex sm:items-end">
              <div>
                <label htmlFor="limit" className="mb-2 block text-sm font-semibold text-slate-300">
                  Results
                </label>
                <select
                  id="limit"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="control-input h-[50px] w-full px-3 text-sm"
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
              </div>

              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="primary-action h-[50px] px-5"
              >
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4Z" />
                    </svg>
                    Searching
                  </>
                ) : (
                  'Search'
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSort(option.value)}
                  disabled={loading}
                  className={`app-tab border border-slate-800/70 ${sort === option.value ? 'app-tab-active border-primary-500/30' : 'bg-surface-950/40'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="status-pill cursor-pointer">
                <input
                  id="includeArxiv"
                  type="checkbox"
                  checked={includeArxiv}
                  onChange={(e) => setIncludeArxiv(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-surface-950 text-primary-500"
                  disabled={loading}
                />
                arXiv
              </label>
              <label className="status-pill cursor-pointer">
                <input
                  id="includeCrossref"
                  type="checkbox"
                  checked={includeCrossref}
                  onChange={(e) => setIncludeCrossref(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-surface-950 text-primary-500"
                  disabled={loading}
                />
                Crossref
              </label>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className={`secondary-action ${showAdvanced ? 'border-primary-500/40 text-primary-300' : ''}`}
                disabled={loading}
              >
                <SlidersIcon />
                Filters
              </button>
            </div>
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-1 gap-3 border-t border-slate-800/80 pt-4 md:grid-cols-5">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-400">
                  Topic
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="surface codes"
                  className="control-input w-full px-3.5 py-2.5 text-sm"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-400">
                  From
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={fromYear}
                  onChange={(e) => setFromYear(e.target.value)}
                  placeholder="2020"
                  className="control-input w-full px-3.5 py-2.5 text-sm"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-400">
                  To
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={toYear}
                  onChange={(e) => setToYear(e.target.value)}
                  placeholder="2026"
                  className="control-input w-full px-3.5 py-2.5 text-sm"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-400">
                  Min cites
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={minCitations}
                  onChange={(e) => setMinCitations(e.target.value)}
                  placeholder="50"
                  className="control-input w-full px-3.5 py-2.5 text-sm"
                  disabled={loading}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
