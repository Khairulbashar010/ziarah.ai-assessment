import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchTrip } from "./trip-search-service";
import { clearTripSearchCache } from "@/lib/storage/trip-query-cache";

const QUERY = "family of 4 from Dubai to London, December 20-27, budget $3000";

describe("trip search query cache", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LLM", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");
    vi.stubEnv("TRIP_SEARCH_CACHE_TTL_MS", "600000");
    clearTripSearchCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearTripSearchCache();
  });

  it("returns a cache miss on the first identical search", async () => {
    const result = await searchTrip(QUERY, "req-a");

    expect(result.meta.cache.status).toBe("miss");
    expect(result.meta.cache.cachedAt).not.toBeNull();
    expect(result.meta.cache.expiresAt).not.toBeNull();
    expect(result.meta.cache.refreshInMs).toBeGreaterThan(590_000);
    expect(result.meta.cache.refreshInMs).toBeLessThanOrEqual(600_000);
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
});
