'use client';

import { useState } from 'react';
import { Paper } from '@/types/paper';

interface PaperCardProps {
  paper: Paper;
}

interface Summary {
  key_findings: string[];
  methodology: string;
  significance: string;
  limitations: string;
}

export default function PaperCard({ paper }: PaperCardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryCached, setSummaryCached] = useState<boolean | null>(null);

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
        headers: {
          'Content-Type': 'application/json',
        },
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
        const errorMessage = errorData.error || `API error: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setSummary(data.summary);
      setSummaryCached(Boolean(data.cached));
      setShowSummary(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
      console.error('Summarization error:', err);
    } finally {
      setLoadingSummary(false);
    }
  };
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 p-6 border border-slate-200 dark:border-slate-700">
      {/* Title */}
      <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
        {paper.url ? (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            {paper.title}
          </a>
        ) : (
          paper.title
        )}
      </h3>

      {/* Authors */}
      {paper.authors && paper.authors.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
          {paper.authors.slice(0, 5).join(', ')}
          {paper.authors.length > 5 && ` +${paper.authors.length - 5} more`}
        </p>
      )}

      {/* Metadata Row */}
      <div className="flex flex-wrap gap-4 text-sm text-slate-500 dark:text-slate-400 mb-4">
        {paper.year && <span>📅 {paper.year}</span>}
        {paper.venue && <span>📍 {paper.venue}</span>}
        {paper.citationCount !== undefined && (
          <span>📊 {paper.citationCount.toLocaleString()} citations</span>
        )}
        {paper.source && (
          <span className="text-primary-600 dark:text-primary-400">
            🔍 {paper.source}
          </span>
        )}
      </div>

      {/* Abstract */}
      {paper.abstract && (
        <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed mb-4 line-clamp-3">
          {paper.abstract}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 items-center flex-wrap">
        {paper.url && (
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            View Details →
          </a>
        )}
        {paper.pdfUrl && (
          <a
            href={paper.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-green-600 dark:text-green-400 hover:underline"
          >
            Download PDF ↓
          </a>
        )}
        
        {/* AI Summarize Button */}
        {paper.abstract && (
          <>
            <button
              onClick={() => handleSummarize(false)}
              disabled={loadingSummary}
              className="text-sm px-3 py-1 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingSummary ? '✨ Summarizing...' : summary ? (showSummary ? '▼ Hide AI Summary' : '▶ Show AI Summary') : '✨ AI Summary'}
            </button>
            <button
              onClick={() => {
                setSummary(null);
                setShowSummary(false);
                setSummaryCached(null);
                handleSummarize(true);
              }}
              disabled={loadingSummary}
              className="text-sm px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Forces regeneration (bypasses DynamoDB cache)"
            >
              ↻ Regenerate
            </button>
          </>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* AI Summary Section */}
      {showSummary && summary && (
        <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
          <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
            ✨ AI-Generated Summary
          </h4>
          {summaryCached !== null && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {summaryCached ? 'Returned from cache (may be an older fallback).' : 'Freshly generated.'}
            </p>
          )}
          
          {/* Key Findings */}
          <div className="mb-3">
            <h5 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">🔍 Key Findings:</h5>
            <ul className="list-disc list-inside space-y-1">
              {summary.key_findings.map((finding, idx) => (
                <li key={idx} className="text-sm text-slate-600 dark:text-slate-400">{finding}</li>
              ))}
            </ul>
          </div>

          {/* Methodology */}
          <div className="mb-3">
            <h5 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">🔬 Methodology:</h5>
            <p className="text-sm text-slate-600 dark:text-slate-400">{summary.methodology}</p>
          </div>

          {/* Significance */}
          <div className="mb-3">
            <h5 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">💡 Significance:</h5>
            <p className="text-sm text-slate-600 dark:text-slate-400">{summary.significance}</p>
          </div>

          {/* Limitations */}
          {summary.limitations && summary.limitations !== 'Not specified' && (
            <div>
              <h5 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">⚠️ Limitations:</h5>
              <p className="text-sm text-slate-600 dark:text-slate-400">{summary.limitations}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
