const PREFIX = "trip";

export const redisKeys = {
  queryCache: (cacheKey: string) => `${PREFIX}:cache:${cacheKey}`,
  result: (requestId: string) => `${PREFIX}:result:${requestId}`,
  refreshLock: (cacheKey: string) => `${PREFIX}:lock:${cacheKey}`,
  namespacePattern: () => `${PREFIX}:*`,
} as const;

/** Keep stale entries in Redis briefly past logical expiry for SWR. */
export const QUERY_CACHE_REDIS_TTL_MULTIPLIER = 3;

/** Result store TTL — GET /api/trips/{id} lookup window. */
export const TRIP_RESULT_TTL_SECONDS = 60 * 60;

/** Distributed refresh lock — matches circuit-breaker cooldown scale. */
export const REFRESH_LOCK_TTL_SECONDS = 30;
