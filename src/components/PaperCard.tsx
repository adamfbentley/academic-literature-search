'use client';

import { useState } from 'react';
import { Paper } from '@/types/paper';

interface PaperCardProps {
  paper: Paper;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  isInCorpusQueue?: boolean;
  onToggleCorpusQueue?: () => void;
}

interface Summary {
  key_findings: string[];
  methodology: string;
  significance: string;
  limitations: string;
}

export default function PaperCard({
  paper,
  isBookmarked,
  onToggleBookmark,
  isInCorpusQueue,
  onToggleCorpusQueue,
}: PaperCardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
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
    <div className="card-lift glass rounded-2xl shadow-card hover:shadow-card-hover p-6 relative overflow-hidden group">
      {/* Source ribbon */}
      {paper.source && (
        <div className="absolute top-4 right-4">
          <span className="px-2.5 py-1 rounded-lg bg-primary-500/10 text-primary-400 text-xs font-semibold border border-primary-500/20">
            {paper.source}
          </span>
        </div>
      )}

      {/* Title */}
      <h3 className="text-lg font-bold text-white mb-2 pr-24 leading-snug">
        {paper.url ? (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-400 transition-colors duration-150"
          >
            {paper.title}
          </a>
        ) : (
          paper.title
        )}
      </h3>

      {/* Authors */}
      {paper.authors && paper.authors.length > 0 && (
        <p className="text-sm text-slate-400 mb-3">
          {paper.authors.slice(0, 5).join(', ')}
          {paper.authors.length > 5 && (
            <span className="text-slate-500"> +{paper.authors.length - 5} more</span>
          )}
        </p>
      )}

      {/* Metadata Row */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        {paper.year && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-800 text-slate-400 text-xs font-medium border border-slate-700/40">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            {paper.year}
          </span>
        )}
        {paper.venue && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-800 text-slate-400 text-xs font-medium truncate max-w-[200px] border border-slate-700/40">
            {paper.venue}
          </span>
        )}
        {paper.citationCount !== undefined && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            {paper.citationCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Abstract — expandable */}
      {paper.abstract && (
        <div className="mb-5">
          <p className={`text-slate-400 text-sm leading-relaxed ${!abstractExpanded ? 'line-clamp-3' : ''}`}>
            {paper.abstract}
          </p>
          {paper.abstract.length > 250 && (
            <button
              onClick={() => setAbstractExpanded(!abstractExpanded)}
              className="mt-1.5 text-xs font-medium text-primary-400 hover:text-primary-300 transition-colors"
            >
              {abstractExpanded ? '▴ Show less' : '▾ Show more'}
            </button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 items-center flex-wrap">
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-400 hover:text-primary-300 transition-colors"
          >
            View paper
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        )}
        {paper.pdfUrl && (
          <a
            href={paper.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            PDF
          </a>
        )}

        {/* Copy Citation */}
        <button
          onClick={copyCitation}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
          title="Copy citation"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          {citationCopied ? 'Copied!' : 'Cite'}
        </button>

        {/* Bookmark */}
        {onToggleBookmark && (
          <button
            onClick={onToggleBookmark}
            className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${isBookmarked ? 'text-primary-400 hover:text-primary-300' : 'text-slate-500 hover:text-slate-300'}`}
            title={isBookmarked ? 'Remove from reading list' : 'Add to reading list'}
          >
            <svg className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            {isBookmarked ? 'Saved' : 'Save'}
          </button>
        )}

        {onToggleCorpusQueue && (
          <button
            onClick={onToggleCorpusQueue}
            className={`inline-flex items-center gap-1.5 text-sm font-medium transition-colors ${isInCorpusQueue ? 'text-accent-300 hover:text-accent-200' : 'text-slate-500 hover:text-slate-300'}`}
            title={isInCorpusQueue ? 'Remove from corpus queue' : 'Add to corpus queue'}
          >
            <svg className="w-4 h-4" fill={isInCorpusQueue ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z" /></svg>
            {isInCorpusQueue ? 'Queued' : 'To Corpus'}
          </button>
        )}
        
        {/* Spacer */}
        <div className="flex-1" />

        {/* AI Summarize Button */}
        {paper.abstract && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSummarize(false)}
              disabled={loadingSummary}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl bg-gradient-to-r from-accent-500/15 to-primary-500/15 text-accent-300 border border-accent-500/25 hover:border-accent-500/40 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loadingSummary ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Summarizing…
                </>
              ) : summary ? (showSummary ? '▾ Hide Summary' : '▸ Show Summary') : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  AI Summary
                </>
              )}
            </button>
            {summary && (
              <button
                onClick={() => {
                  setSummary(null);
                  setShowSummary(false);
                  setSummaryCached(null);
                  handleSummarize(true);
                }}
                disabled={loadingSummary}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-surface-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                title="Regenerate (bypass cache)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      {/* AI Summary Section */}
      {showSummary && summary && (
        <div className="mt-5 rounded-xl overflow-hidden border border-accent-500/20 animate-slide-down">
          <div className="h-0.5 bg-gradient-to-r from-accent-400 via-primary-400 to-accent-400" />
          <div className="p-5 bg-gradient-to-br from-accent-500/5 to-primary-500/5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-accent-500 to-primary-500 text-white text-xs">✦</span>
                AI Summary
              </h4>
              {summaryCached !== null && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${summaryCached ? 'bg-surface-800 text-slate-500' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  {summaryCached ? 'cached' : 'fresh'}
                </span>
              )}
            </div>
            
            {/* Key Findings */}
            <div className="mb-4">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Key Findings</h5>
              <ul className="space-y-1.5">
                {summary.key_findings.map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent-400" />
                    {finding}
                  </li>
                ))}
              </ul>
            </div>

            {/* Methodology */}
            <div className="mb-4">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Methodology</h5>
              <p className="text-sm text-slate-400">{summary.methodology}</p>
            </div>

            {/* Significance */}
            <div className="mb-4">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Significance</h5>
              <p className="text-sm text-slate-400">{summary.significance}</p>
            </div>

            {/* Limitations */}
            {summary.limitations && summary.limitations !== 'Not specified' && (
              <div className="pt-3 border-t border-slate-700/40">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1.5">Limitations</h5>
                <p className="text-sm text-slate-500">{summary.limitations}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
