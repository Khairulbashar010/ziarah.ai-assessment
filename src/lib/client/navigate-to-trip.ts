import { v4 as uuidv4 } from "uuid";

export function buildChatSearchUrl(query: string, requestId = uuidv4()): string {
  return `/chat/${requestId}?q=${encodeURIComponent(query.trim())}&search=1`;
}

/** Full-page navigation avoids flaky App Router RSC fetches during heavy dev compiles. */
export function navigateToTripSearch(query: string, requestId = uuidv4()): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  window.location.assign(buildChatSearchUrl(trimmed, requestId));
}
