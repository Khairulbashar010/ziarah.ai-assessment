import type { TripSearchParams, TripSearchResponse } from "@/lib/types/trip";
import type { TripSearchStreamEvent } from "@/lib/trip-search/stream-events";
import { toUserErrorMessage } from "@/lib/user-messages";

const STORAGE_KEY = "ziarah-trip-results";

type TripCacheEntry = {
  query: string;
  result: TripSearchResponse;
  cachedAt: number;
};

function readCache(): Record<string, TripCacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, TripCacheEntry>) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export type TripSearchRequest = {
  query: string;
  context?: TripSearchParams | null;
};

export async function searchTripClient(
  query: string,
  requestId?: string,
  context?: TripSearchParams | null,
): Promise<TripSearchResponse> {
  const response = await fetch("/api/trips/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
    body: JSON.stringify({ query, ...(context ? { context } : {}) }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(toUserErrorMessage(error.error, response.status));
  }

  const result = (await response.json()) as TripSearchResponse;
  saveTripToCache(result.requestId, query, result);
  return result;
}

export type TripSearchStreamHandlers = {
  onEvent: (event: TripSearchStreamEvent) => void;
  onError?: (error: Error) => void;
  requestId?: string;
};

export async function searchTripClientStream(
  query: string,
  handlers: TripSearchStreamHandlers,
  context?: TripSearchParams | null,
): Promise<TripSearchResponse | null> {
  const response = await fetch("/api/trips/search/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(handlers.requestId ? { "X-Request-Id": handlers.requestId } : {}),
    },
    body: JSON.stringify({ query, ...(context ? { context } : {}) }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(toUserErrorMessage(error.error, response.status));
  }

  if (!response.body) {
    throw new Error(toUserErrorMessage("Streaming response unavailable"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: TripSearchResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const line = chunk
        .split("\n")
        .find((entry) => entry.startsWith("data:"));
      if (!line) continue;

      const payload = line.slice(5).trim();
      if (!payload) continue;

      const event = JSON.parse(payload) as TripSearchStreamEvent;
      handlers.onEvent(event);

      if (event.type === "complete") {
        finalResult = event.result;
        saveTripToCache(event.result.requestId, query, event.result);
      }

      if (event.type === "error") {
        throw new Error(toUserErrorMessage(event.message, event.status));
      }
    }
  }

  return finalResult;
}

export function saveTripToCache(requestId: string, query: string, result: TripSearchResponse) {
  const cache = readCache();
  cache[requestId] = { query, result, cachedAt: Date.now() };
  writeCache(cache);
}

export function getTripFromCache(requestId: string): TripCacheEntry | undefined {
  return readCache()[requestId];
}

export async function fetchTripResult(requestId: string): Promise<TripSearchResponse | null> {
  const cached = getTripFromCache(requestId);
  if (cached) return cached.result;

  const response = await fetch(`/api/trips/${requestId}`);
  if (!response.ok) return null;
  return response.json();
}
