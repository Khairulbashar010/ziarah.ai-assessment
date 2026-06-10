const FROM_TO_PATTERN = /from\s+([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+?)(?:,|$)/i;

export function parseFromTo(query: string): { origin: string; destination: string } | null {
  const match = query.match(FROM_TO_PATTERN);
  if (!match) return null;

  return {
    origin: match[1].trim(),
    destination: match[2].trim().replace(/,.*/, "").trim(),
  };
}
