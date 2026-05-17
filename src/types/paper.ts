export interface Paper {
  paperId?: string;
  title: string;
  abstract?: string;
  authors?: string[];
  year?: number;
  citationCount?: number;
  publicationDate?: string;
  venue?: string;
  url?: string;
  pdfUrl?: string;
  source?: string;
}

export interface PaperSummary {
  key_findings: string[];
  methodology: string;
  significance: string;
  limitations: string;
}
