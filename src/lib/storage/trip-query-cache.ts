import { randomUUID } from "node:crypto";
import type { TripSearchCacheMeta, TripSearchParams, TripSearchResult } from "@/lib/types/trip";
import { buildTripSearchCacheKey } from "@/lib/trip-search/cache-key";
import { tripSearchCacheTtlMs } from "@/lib/trip-search/cache-policy";
import {
  QUERY_CACHE_REDIS_TTL_MULTIPLIER,
  REFRESH_LOCK_TTL_SECONDS,
  redisKeys,
} from "@/lib/storage/redis-keys";
import {
  clearRedisNamespace,
  redisDel,
  redisExists,
  redisGet,
  redisSet,
} from "@/lib/storage/redis";

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

function parseCachedEntry(raw: string): CachedTripSearchEntry | null {
  try {
    return JSON.parse(raw) as CachedTripSearchEntry;
  } catch {
    return null;
  }
}

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

export async function lookupTripSearchCache(
  params: TripSearchParams,
  now = Date.now(),
): Promise<TripSearchCacheLookup> {
  const cacheKey = buildTripSearchCacheKey(params);
  const raw = await redisGet(redisKeys.queryCache(cacheKey));
  if (!raw) {
    return { status: "miss", entry: null };
  }

  const entry = parseCachedEntry(raw);
  if (!entry) {
    await redisDel(redisKeys.queryCache(cacheKey));
    return { status: "miss", entry: null };
  }

  if (now < entry.expiresAt) {
    return { status: "fresh", entry };
  }

  return { status: "stale", entry };
}

export async function saveTripSearchCache(
  params: TripSearchParams,
  result: TripSearchResult,
  now = Date.now(),
) {
  const cacheKey = buildTripSearchCacheKey(params);
  const ttlMs = tripSearchCacheTtlMs();
  const entry: CachedTripSearchEntry = {
    cacheKey,
    result,
    cachedAt: now,
    expiresAt: now + ttlMs,
  };

  await redisSet(redisKeys.queryCache(cacheKey), JSON.stringify(entry), {
    PX: ttlMs * QUERY_CACHE_REDIS_TTL_MULTIPLIER,
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

async function waitForFreshCache(
  params: TripSearchParams,
  timeoutMs = 10_000,
  pollMs = 100,
): Promise<TripSearchResult | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const lookup = await lookupTripSearchCache(params);
    if (lookup.status === "fresh" && lookup.entry) {
      return lookup.entry.result;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return null;
}

export async function isRefreshInProgress(cacheKey: string): Promise<boolean> {
  return redisExists(redisKeys.refreshLock(cacheKey));
}

export async function runWithRefreshLock(
  cacheKey: string,
  refresh: () => Promise<TripSearchResult | null>,
  paramsForWait?: TripSearchParams,
): Promise<TripSearchResult | null> {
  const lockKey = redisKeys.refreshLock(cacheKey);
  const lockToken = randomUUID();
  const acquired = await redisSet(lockKey, lockToken, {
    NX: true,
    EX: REFRESH_LOCK_TTL_SECONDS,
  });

  if (acquired !== "OK") {
    if (paramsForWait) {
      return waitForFreshCache(paramsForWait);
    }
    return null;
  }

  try {
    return await refresh();
  } finally {
    const current = await redisGet(lockKey);
    if (current === lockToken) {
      await redisDel(lockKey);
    }
  }
}

/** Test helper */
export async function clearTripSearchCache() {
  await clearRedisNamespace();
}
