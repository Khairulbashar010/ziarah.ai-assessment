import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TripSearchParams, TripSearchResult } from "@/lib/types/trip";
import { buildTripSearchCacheKey } from "@/lib/trip-search/cache-key";
import { redisKeys } from "@/lib/storage/redis-keys";
import { redisSet } from "@/lib/storage/redis";
import {
  attachCacheMeta,
  buildCacheMeta,
  clearTripSearchCache,
  isRefreshInProgress,
  lookupTripSearchCache,
  materializeCachedResult,
  runWithRefreshLock,
  saveTripSearchCache,
} from "@/lib/storage/trip-query-cache";

const params: TripSearchParams = {
  tripType: "ROUND_TRIP",
  flights: {
    origin: "DXB",
    destination: "LON",
    departureDate: "2025-12-20",
    returnDate: "2025-12-27",
    passengers: { adults: 2, children: 0, infants: 0 },
    cabin: "ECONOMY",
  },
  hotels: {
    destination: "London",
    destinationCode: "LON",
    checkIn: "2025-12-20",
    checkOut: "2025-12-27",
    occupancies: [{ rooms: 1, adults: 2, children: 0 }],
  },
};

function minimalResult(): TripSearchResult {
  return {
    requestId: "req-1",
    parsedQuery: params,
    meta: {
      durationMs: 1,
      providersQueried: 3,
      providersSucceeded: 3,
      providersFailed: 0,
      partialResults: false,
      cache: buildCacheMeta("miss", null),
    },
    providers: {
      sabre: { domain: "flights", status: "success", offerCount: 1, durationMs: 1 },
      amadeus: { domain: "flights", status: "success", offerCount: 1, durationMs: 1 },
      hotelbeds: { domain: "hotels", status: "success", offerCount: 1, durationMs: 1 },
    },
    flights: { totalOffers: 1, withinBudget: true, offers: [] },
    hotels: { totalOffers: 1, offers: [] },
    tripSummary: {
      cheapestFlight: 100,
      cheapestHotel: 200,
      estimatedTripTotal: 300,
      currency: "USD",
      withinBudget: true,
      budgetRemaining: 100,
      suggestedMinBudget: null,
    },
  };
}

describe("trip query cache", () => {
  beforeEach(async () => {
    vi.stubEnv("TRIP_SEARCH_CACHE_TTL_MS", "1200000");
    await clearTripSearchCache();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await clearTripSearchCache();
  });

  it("uses a stable key for equivalent search params", () => {
    const a = buildTripSearchCacheKey(params);
    const b = buildTripSearchCacheKey({
      ...params,
      flights: { ...params.flights, origin: "dxb", destination: "lon" },
    });
    expect(a).toBe(b);
  });

  it("returns miss before anything is cached", async () => {
    expect((await lookupTripSearchCache(params)).status).toBe("miss");
  });

  it("builds cache meta for misses and refreshing states", async () => {
    expect(buildCacheMeta("miss", null)).toMatchObject({
      status: "miss",
      cachedAt: null,
      expiresAt: null,
      refreshInMs: null,
    });

    const now = 1_700_000_000_000;
    await saveTripSearchCache(params, minimalResult(), now);
    const entry = (await lookupTripSearchCache(params, now)).entry!;

    expect(buildCacheMeta("refreshing", entry, now + 5 * 60 * 1000)).toMatchObject({
      status: "refreshing",
      refreshInMs: 0,
    });

    expect(buildCacheMeta("fresh", entry, now)).toMatchObject({
      status: "fresh",
      refreshInMs: 20 * 60 * 1000,
    });
  });

  it("attaches cache metadata to live search results", async () => {
    const now = 1_700_000_000_000;
    await saveTripSearchCache(params, minimalResult(), now);
    const entry = (await lookupTripSearchCache(params, now)).entry;
    const attached = attachCacheMeta(minimalResult(), "miss", entry);

    expect(attached.meta.cache.status).toBe("miss");
    expect(attached.meta.cache.cachedAt).not.toBeNull();
  });

  it("serves fresh cache within the fixed TTL window", async () => {
    const now = 1_700_000_000_000;
    await saveTripSearchCache(params, minimalResult(), now);

    const lookup = await lookupTripSearchCache(params, now + 10 * 60 * 1000);
    expect(lookup.status).toBe("fresh");
    expect(lookup.entry?.expiresAt).toBe(now + 20 * 60 * 1000);
  });

  it("keeps the original expiry on cache hits (10 min left, not a new 20 min window)", async () => {
    const now = 1_700_000_000_000;
    await saveTripSearchCache(params, minimalResult(), now);

    const atTenMinutes = now + 10 * 60 * 1000;
    const materialized = materializeCachedResult(
      (await lookupTripSearchCache(params, atTenMinutes)).entry!,
      "req-2",
      atTenMinutes,
      "fresh",
      atTenMinutes,
    );

    expect(materialized.meta.cache.refreshInMs).toBe(10 * 60 * 1000);
    expect(materialized.meta.cache.expiresAt).toBe(new Date(now + 20 * 60 * 1000).toISOString());
  });

  it("marks cache stale after expiry", async () => {
    const now = 1_700_000_000_000;
    await saveTripSearchCache(params, minimalResult(), now);

    const lookup = await lookupTripSearchCache(params, now + 21 * 60 * 1000);
    expect(lookup.status).toBe("stale");

    const stale = materializeCachedResult(lookup.entry!, "req-3", now + 21 * 60 * 1000, "stale");
    expect(stale.meta.cache.refreshInMs).toBe(0);
  });

  it("marks refresh in progress while a lock is held", async () => {
    let resolveRefresh!: (value: TripSearchResult | null) => void;
    const refreshPromise = new Promise<TripSearchResult | null>((resolve) => {
      resolveRefresh = resolve;
    });

    const locked = runWithRefreshLock("cache-key-a", () => refreshPromise);
    expect(await isRefreshInProgress("cache-key-a")).toBe(true);

    resolveRefresh(minimalResult());
    await locked;
    expect(await isRefreshInProgress("cache-key-a")).toBe(false);
  });

  it("deduplicates concurrent refresh work for the same cache key", async () => {
    let calls = 0;
    const slowRefresh = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      const result = minimalResult();
      await saveTripSearchCache(params, result);
      return result;
    };

    const first = runWithRefreshLock("cache-key-b", slowRefresh, params);
    const second = runWithRefreshLock("cache-key-b", slowRefresh, params);

    const [a, b] = await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(a?.requestId).toBe("req-1");
    expect(b?.requestId).toBe("req-1");
  });

  it("returns null when a refresh lock is already held and no wait params are provided", async () => {
    let resolveRefresh!: (value: TripSearchResult | null) => void;
    const refreshPromise = new Promise<TripSearchResult | null>((resolve) => {
      resolveRefresh = resolve;
    });

    const locked = runWithRefreshLock("cache-key-c", () => refreshPromise);
    const skipped = await runWithRefreshLock("cache-key-c", async () => minimalResult());

    expect(skipped).toBeNull();

    resolveRefresh(minimalResult());
    await locked;
  });

  it("treats corrupt cache payloads as a miss and deletes the entry", async () => {
    const cacheKey = buildTripSearchCacheKey(params);
    await redisSet(redisKeys.queryCache(cacheKey), "{not-json");

    const lookup = await lookupTripSearchCache(params);
    expect(lookup.status).toBe("miss");
    expect(lookup.entry).toBeNull();
    expect(await lookupTripSearchCache(params)).toMatchObject({ status: "miss", entry: null });
  });

  it("marks stale cache metadata with zero refresh window", async () => {
    const now = 1_700_000_000_000;
    await saveTripSearchCache(params, minimalResult(), now);
    const entry = (await lookupTripSearchCache(params, now + 21 * 60 * 1000)).entry!;

    expect(buildCacheMeta("stale", entry, now + 21 * 60 * 1000)).toMatchObject({
      status: "stale",
      refreshInMs: 0,
    });
  });

  it("times out when waiting for another refresh to populate fresh cache", async () => {
    vi.useFakeTimers();

    let resolveRefresh!: (value: TripSearchResult | null) => void;
    const refreshPromise = new Promise<TripSearchResult | null>((resolve) => {
      resolveRefresh = resolve;
    });

    void runWithRefreshLock("cache-key-timeout", () => refreshPromise, params);
    const waiter = runWithRefreshLock("cache-key-timeout", async () => minimalResult(), params);

    await vi.advanceTimersByTimeAsync(10_100);
    await expect(waiter).resolves.toBeNull();

    resolveRefresh(null);
    vi.useRealTimers();
  });
});
