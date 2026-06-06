export function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function buildSearchText(input: string): string {
  const normalized = normalizeText(input);
  const folded = foldAccents(normalized).toLowerCase();
  const tokens = folded.match(/[a-z0-9]+/g) ?? [];
  const searchTokens = new Set<string>();

  for (const token of tokens) {
    if (token.length < 2) {
      continue;
    }

    searchTokens.add(token);

    if (token.length >= 6) {
      for (const fragment of buildTokenFragments(token)) {
        searchTokens.add(fragment);

        if (searchTokens.size > 20000) {
          break;
        }
      }
    }

    if (searchTokens.size > 20000) {
      break;
    }
  }

  return `${normalized} ${folded} ${Array.from(searchTokens).join(" ")}`;
}

function buildTokenFragments(token: string): string[] {
  const fragments: string[] = [];
  const maxLength = Math.min(15, token.length);

  for (let size = 3; size <= maxLength; size += 1) {
    for (let start = 0; start <= token.length - size; start += 1) {
      fragments.push(token.slice(start, start + size));

      if (fragments.length >= 160) {
        return fragments;
      }
    }
  }

  return fragments;
}

function foldAccents(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
