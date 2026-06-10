import type { TripSearchCacheMeta, TripSearchParams, TripSearchResult } from "@/lib/types/trip";
import { buildTripSearchCacheKey } from "@/lib/trip-search/cache-key";
import { tripSearchCacheTtlMs } from "@/lib/trip-search/cache-policy";

export type TripSearchCacheStatus = "fresh" | "stale" | "miss";

export type CachedTripSearchEntry = {
  cacheKey: string;
  result: TripSearchResult;
  cachedAt: number;
  expiresAt: number;
};

export type TripSearchCacheLookup = {
  status: TripSearchCacheStatus;
  entry: CachedTripSearchEntry | null;
};

const store = new Map<string, CachedTripSearchEntry>();
const refreshLocks = new Map<string, Promise<TripSearchResult | null>>();

export function buildCacheMeta(
  status: TripSearchCacheMeta["status"],
  entry: CachedTripSearchEntry | null,
  now = Date.now(),
): TripSearchCacheMeta {
  const ttlMs = tripSearchCacheTtlMs();

  if (!entry) {
    return {
      status,
      cachedAt: null,
      expiresAt: null,
      refreshInMs: null,
      ttlMs,
    };
  }

  const refreshInMs = Math.max(0, entry.expiresAt - now);

  return {
    status,
    cachedAt: new Date(entry.cachedAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
    refreshInMs: status === "stale" || status === "refreshing" ? 0 : refreshInMs,
    ttlMs,
  };
}

export function lookupTripSearchCache(
  params: TripSearchParams,
  now = Date.now(),
): TripSearchCacheLookup {
  const cacheKey = buildTripSearchCacheKey(params);
  const entry = store.get(cacheKey);

  if (!entry) {
    return { status: "miss", entry: null };
  }

  if (now < entry.expiresAt) {
    return { status: "fresh", entry };
  }

  return { status: "stale", entry };
}

export function saveTripSearchCache(params: TripSearchParams, result: TripSearchResult, now = Date.now()) {
  const cacheKey = buildTripSearchCacheKey(params);
  const ttlMs = tripSearchCacheTtlMs();

  store.set(cacheKey, {
    cacheKey,
    result,
    cachedAt: now,
    expiresAt: now + ttlMs,
  });
}

export function materializeCachedResult(
  entry: CachedTripSearchEntry,
  requestId: string,
  started: number,
  status: "fresh" | "stale",
  now = Date.now(),
): TripSearchResult {
  return {
    ...entry.result,
    requestId,
    meta: {
      ...entry.result.meta,
      durationMs: now - started,
      partialResults: false,
      cache: buildCacheMeta(status, entry, now),
    },
  };
}

export function attachCacheMeta(
  result: TripSearchResult,
  status: TripSearchCacheMeta["status"],
  entry: CachedTripSearchEntry | null,
): TripSearchResult {
  return {
    ...result,
    meta: {
      ...result.meta,
      cache: buildCacheMeta(status, entry),
    },
  };
}

export function getRefreshLock(cacheKey: string): Promise<TripSearchResult | null> | undefined {
  return refreshLocks.get(cacheKey);
}

export function runWithRefreshLock(
  cacheKey: string,
  refresh: () => Promise<TripSearchResult | null>,
): Promise<TripSearchResult | null> {
  const existing = refreshLocks.get(cacheKey);
  if (existing) return existing;

  const promise = refresh().finally(() => {
    refreshLocks.delete(cacheKey);
  });

  refreshLocks.set(cacheKey, promise);
  return promise;
}

/** Test helper */
export function clearTripSearchCache() {
  store.clear();
  refreshLocks.clear();
}
