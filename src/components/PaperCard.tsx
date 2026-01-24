'use client';

import { Paper } from '@/types/paper';

interface PaperCardProps {
  paper: Paper;
}

export default function PaperCard({ paper }: PaperCardProps) {
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
      <div className="flex gap-3">
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
      </div>
    </div>
  );
}
