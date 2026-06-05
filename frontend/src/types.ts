export type HealthResponse = {
  api: string;
  search: string;
  index?: string;
  error?: string;
};

export type IndexResponse = {
  indexedCount: number;
  documents: Array<{
    id: string;
    title: string;
    fileName: string;
    contentLength?: number;
  }>;
};

export type SearchHit = {
  id: string;
  title: string;
  fileName: string;
  content: string;
  tags: string[];
  uploadedAt: string;
  documentType: string;
  source: string;
  snippet: string;
};

export type SearchResponse = {
  query: string;
  estimatedTotalHits: number;
  hits: SearchHit[];
};

export type DocumentSummary = {
  id: string;
  title: string;
  fileName: string;
  contentLength: number;
  tags: string[];
  uploadedAt: string;
  documentType: string;
  source: string;
};

export type DocumentsResponse = {
  documents: DocumentSummary[];
};
