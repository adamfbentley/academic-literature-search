'use client';

import { useState } from 'react';
import { Paper, PaperSummary } from '@/types/paper';

interface PaperCardProps {
  paper: Paper;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  isInCorpusQueue?: boolean;
  onToggleCorpusQueue?: () => void;
}

function ExternalIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4h6m0 0v6m0-6L10 14M6 8H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1" />
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

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="h-4 w-4" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4.75A2.25 2.25 0 0 1 8.25 2.5h7.5A2.25 2.25 0 0 1 18 4.75v16l-6-3.25L6 20.75v-16Z" />
    </svg>
  );
}

function CorpusIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="h-4 w-4" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v11A2.5 2.5 0 0 1 16.5 20h-9A2.5 2.5 0 0 1 5 17.5v-11Zm4 1.5h6M9 12h6M9 16h4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 3 7.8 14H12l-1 7 5.2-11H12l1-7Z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7v5h-5M4 17v-5h5m9.2-4A7 7 0 0 0 6.1 6.8M5.8 16a7 7 0 0 0 12.1 1.2" />
    </svg>
  );
}

export default function PaperCard({
  paper,
  isBookmarked,
  onToggleBookmark,
  isInCorpusQueue,
  onToggleCorpusQueue,
}: PaperCardProps) {
  const [summary, setSummary] = useState<PaperSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryCached, setSummaryCached] = useState<boolean | null>(null);
  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const [citationCopied, setCitationCopied] = useState(false);

  const handleSummarize = async (forceRefresh = false) => {
    if (summary) {
      setShowSummary(!showSummary);
      return;
    }

    if (!paper.abstract) {
      setError('No abstract available to summarize');
      return;
    }

    setLoadingSummary(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperId: paper.paperId,
          title: paper.title,
          abstract: paper.abstract,
          forceRefresh,
          debug: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();
      setSummary(data.summary);
      setSummaryCached(Boolean(data.cached));
      setShowSummary(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  const copyCitation = () => {
    const authors = paper.authors?.join(', ') || 'Unknown';
    const year = paper.year || 'n.d.';
    const venue = paper.venue ? ` ${paper.venue}.` : '';
    const citation = `${authors} (${year}). ${paper.title}.${venue}`;
    navigator.clipboard.writeText(citation).then(() => {
      setCitationCopied(true);
      setTimeout(() => setCitationCopied(false), 2000);
    });
  };

  return (
    <article className="workspace-panel art-panel citation-rules group overflow-hidden p-4 transition-all hover:border-amber-300/25 md:p-5">
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {paper.source && (
              <span className="status-pill border-amber-400/25 bg-amber-400/10 text-amber-200">
                {paper.source}
              </span>
            )}
            {paper.year && <span className="status-pill">{paper.year}</span>}
            {paper.citationCount !== undefined && (
              <span className="status-pill border-primary-400/20 bg-primary-400/10 text-primary-200">
                {paper.citationCount.toLocaleString()} cites
              </span>
            )}
            {paper.venue && (
              <span className="status-pill max-w-full truncate sm:max-w-[260px]">
                {paper.venue}
              </span>
            )}
          </div>

          <h3 className="illuminated-title text-lg font-semibold leading-snug">
            {paper.url ? (
              <a href={paper.url} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-amber-100">
                {paper.title}
              </a>
            ) : (
              paper.title
            )}
          </h3>

          {paper.authors && paper.authors.length > 0 && (
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {paper.authors.slice(0, 5).join(', ')}
              {paper.authors.length > 5 && <span className="text-slate-600"> +{paper.authors.length - 5} more</span>}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {paper.url && (
            <a href={paper.url} target="_blank" rel="noopener noreferrer" className="secondary-action">
              <ExternalIcon />
              Paper
            </a>
          )}
          {paper.pdfUrl && (
            <a href={paper.pdfUrl} target="_blank" rel="noopener noreferrer" className="secondary-action text-emerald-300 hover:text-emerald-200">
              PDF
            </a>
          )}
          {onToggleBookmark && (
            <button
              onClick={onToggleBookmark}
              className={`secondary-action ${isBookmarked ? 'border-primary-500/30 bg-primary-500/10 text-primary-300' : ''}`}
              title={isBookmarked ? 'Remove from reading list' : 'Add to reading list'}
            >
              <BookmarkIcon filled={isBookmarked} />
              {isBookmarked ? 'Saved' : 'Save'}
            </button>
          )}
          {onToggleCorpusQueue && (
            <button
              onClick={onToggleCorpusQueue}
              className={`secondary-action ${isInCorpusQueue ? 'border-accent-500/30 bg-accent-500/10 text-accent-300' : ''}`}
              title={isInCorpusQueue ? 'Remove from corpus queue' : 'Add to corpus queue'}
            >
              <CorpusIcon filled={isInCorpusQueue} />
              {isInCorpusQueue ? 'Queued' : 'Queue'}
            </button>
          )}
        </div>
      </div>

      {paper.abstract && (
        <div className="relative mt-4 border-t border-amber-300/10 pt-4">
          <p className={`text-sm leading-7 text-slate-400 ${!abstractExpanded ? 'line-clamp-3' : ''}`}>
            {paper.abstract}
          </p>
          {paper.abstract.length > 250 && (
            <button
              onClick={() => setAbstractExpanded(!abstractExpanded)}
              className="quiet-action mt-2"
            >
              {abstractExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-amber-300/10 pt-4">
        <button onClick={copyCitation} className="quiet-action" title="Copy citation">
          <CopyIcon />
          {citationCopied ? 'Copied' : 'Cite'}
        </button>

        {paper.abstract && (
          <button
            onClick={() => handleSummarize(false)}
            disabled={loadingSummary}
            className="secondary-action ml-auto border-amber-400/25 bg-amber-400/10 text-amber-200 hover:text-amber-100"
          >
            {loadingSummary ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4Z" />
                </svg>
                Summarizing
              </>
            ) : summary ? (
              showSummary ? 'Hide summary' : 'Show summary'
            ) : (
              <>
                <SparkIcon />
                AI summary
              </>
            )}
          </button>
        )}

        {summary && (
          <button
            onClick={() => {
              setSummary(null);
              setShowSummary(false);
              setSummaryCached(null);
              handleSummarize(true);
            }}
            disabled={loadingSummary}
            className="icon-button"
            title="Regenerate summary"
          >
            <RefreshIcon />
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {showSummary && summary && (
        <div className="relative mt-5 border-t border-accent-500/20 pt-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-white">AI summary</h4>
            {summaryCached !== null && (
              <span className={`status-pill ${summaryCached ? '' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
                {summaryCached ? 'cached' : 'fresh'}
              </span>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <h5 className="mb-2 text-sm font-semibold text-slate-300">Key findings</h5>
              <ul className="space-y-2">
                {summary.key_findings.map((finding, idx) => (
                  <li key={idx} className="flex gap-2 text-sm leading-6 text-slate-400">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-400" />
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-4">
              <div>
                <h5 className="mb-1 text-sm font-semibold text-slate-300">Methodology</h5>
                <p className="text-sm leading-6 text-slate-400">{summary.methodology}</p>
              </div>
              <div>
                <h5 className="mb-1 text-sm font-semibold text-slate-300">Significance</h5>
                <p className="text-sm leading-6 text-slate-400">{summary.significance}</p>
              </div>
              {summary.limitations && summary.limitations !== 'Not specified' && (
                <div>
                  <h5 className="mb-1 text-sm font-semibold text-amber-300">Limitations</h5>
                  <p className="text-sm leading-6 text-slate-500">{summary.limitations}</p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </article>
  );
}
