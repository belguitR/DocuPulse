import type { DocumentsResponse, HealthResponse, IndexResponse, SearchResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3001";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`);

  if (!response.ok) {
    return (await response.json()) as HealthResponse;
  }

  return readJson<HealthResponse>(response);
}

export async function indexDocuments(formData: FormData): Promise<IndexResponse> {
  const response = await fetch(`${API_BASE_URL}/api/documents/index`, {
    method: "POST",
    body: formData,
  });

  return readJson<IndexResponse>(response);
}

export async function fetchDocuments(): Promise<DocumentsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/documents`);
  return readJson<DocumentsResponse>(response);
}

export async function searchDocuments(query: string): Promise<SearchResponse> {
  const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`);
  return readJson<SearchResponse>(response);
}

export async function openDocumentInDesktopApp(documentId: string): Promise<{ opened: boolean; autoReindex: boolean; fileName: string }> {
  const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(documentId)}/open`, {
    method: "POST",
  });

  return readJson<{ opened: boolean; autoReindex: boolean; fileName: string }>(response);
}

export function toApiUrl(path: string | undefined): string {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
