export type IndexedDocument = {
  id: string;
  title: string;
  fileName: string;
  content: string;
  contentSearch?: string;
  applicationNames?: string[];
  documentCategory?: string;
  programmingLanguages?: string[];
  storedFileName?: string;
  mimeType?: string;
  originalFileUrl?: string;
  previewFileUrl?: string;
  tags: string[];
  uploadedAt: string;
  documentType: string;
  source: string;
};

export type SearchResult = Omit<IndexedDocument, "contentSearch"> & {
  snippet: string;
};
