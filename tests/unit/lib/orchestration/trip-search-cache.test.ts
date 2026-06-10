import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchTrip, QuorumError } from "@/lib/orchestration/trip-search-service";
import { clearTripSearchCache, saveTripSearchCache } from "@/lib/storage/trip-query-cache";
import * as sabreClient from "@/lib/providers/sabre/client";
import * as amadeusClient from "@/lib/providers/amadeus/client";
import * as cacheModule from "@/lib/storage/trip-query-cache";

const QUERY = "family of 4 from Dubai to London, December 20-27, budget $3000";

describe("trip search query cache", () => {
  beforeEach(async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LLM", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");
    vi.stubEnv("TRIP_SEARCH_CACHE_TTL_MS", "600000");
    await clearTripSearchCache();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await clearTripSearchCache();
  });

  it("returns a cache miss on the first identical search", async () => {
    const result = await searchTrip(QUERY, "req-a");

    expect(result.meta.cache.status).toBe("miss");
    expect(result.meta.cache.cachedAt).not.toBeNull();
    expect(result.meta.cache.expiresAt).not.toBeNull();
    expect(result.meta.cache.refreshInMs).toBeGreaterThan(590_000);
    expect(result.meta.cache.refreshInMs).toBeLessThanOrEqual(600_000);
  });

  it("serves stale cache immediately while refresh runs in the background", async () => {
    const first = await searchTrip(QUERY, "req-stale-seed");
    await saveTripSearchCache(first.parsedQuery, first, Date.now() - 25 * 60 * 1000);

    const second = await searchTrip(QUERY, "req-stale");

    expect(second.meta.cache.status).toBe("stale");
    expect(second.requestId).toBe("req-stale");
  });

  it("serves a fresh cache hit without resetting the expiry window", async () => {
    const first = await searchTrip(QUERY, "req-a");
    const cachedAt = first.meta.cache.cachedAt;
    const expiresAt = first.meta.cache.expiresAt;

    const second = await searchTrip(QUERY, "req-b");

    expect(second.meta.cache.status).toBe("fresh");
    expect(second.meta.cache.cachedAt).toBe(cachedAt);
    expect(second.meta.cache.expiresAt).toBe(expiresAt);
    expect(second.requestId).toBe("req-b");
    expect(second.meta.durationMs).toBeLessThan(50);
  });

  it("logs and swallows background refresh failures for stale cache", async () => {
    const first = await searchTrip(QUERY, "req-stale-seed");
    await saveTripSearchCache(first.parsedQuery, first, Date.now() - 25 * 60 * 1000);

    const sabreSpy = vi
      .spyOn(sabreClient, "searchSabreFlights")
      .mockRejectedValue(new Error("Sabre down"));
    const amadeusSpy = vi
      .spyOn(amadeusClient, "searchAmadeusFlights")
      .mockRejectedValue(new Error("Amadeus down"));
    const loggerModule = await import("@/lib/observability/logger");
    const refreshSpy = vi.spyOn(loggerModule, "logCacheRefreshFailure");

    const stale = await searchTrip(QUERY, "req-stale-refresh-fail");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(stale.meta.cache.status).toBe("stale");
    expect(refreshSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(QuorumError),
      "background",
    );

    sabreSpy.mockRestore();
    amadeusSpy.mockRestore();
    refreshSpy.mockRestore();
  });

  it("logs stale refresh lock failures without blocking the cached response", async () => {
    const first = await searchTrip(QUERY, "req-stale-lock-seed");
    await saveTripSearchCache(first.parsedQuery, first, Date.now() - 25 * 60 * 1000);

    const lockSpy = vi
      .spyOn(cacheModule, "runWithRefreshLock")
      .mockRejectedValue(new Error("lock failed"));
    const loggerModule = await import("@/lib/observability/logger");
    const refreshSpy = vi.spyOn(loggerModule, "logCacheRefreshFailure");

    const stale = await searchTrip(QUERY, "req-stale-lock");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(stale.meta.cache.status).toBe("stale");
    expect(refreshSpy).toHaveBeenCalledWith(expect.anything(), expect.any(Error), "stale");

    lockSpy.mockRestore();
    refreshSpy.mockRestore();
  });
});
