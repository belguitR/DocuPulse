export function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function parseTags(input: string | undefined): string[] {
  if (!input) {
    return [];
  }

  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function buildSnippet(content: string, query: string): string {
  if (!content) {
    return "";
  }

  const normalizedContent = normalizeText(content);

  if (!query) {
    return normalizedContent.slice(0, 220);
  }

  const index = normalizedContent.toLowerCase().indexOf(query.toLowerCase());

  if (index === -1) {
    return normalizedContent.slice(0, 220);
  }

  const start = Math.max(0, index - 90);
  const end = Math.min(normalizedContent.length, index + query.length + 130);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedContent.length ? "..." : "";

  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}
