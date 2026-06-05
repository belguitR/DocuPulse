export type IndexedDocument = {
  id: string;
  title: string;
  fileName: string;
  content: string;
  tags: string[];
  uploadedAt: string;
  documentType: string;
  source: string;
};

export type SearchResult = IndexedDocument & {
  snippet: string;
};
