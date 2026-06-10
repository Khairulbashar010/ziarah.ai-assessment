import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TripSearchParams, TripSearchResult } from "@/lib/types/trip";
import { buildTripSearchCacheKey } from "@/lib/trip-search/cache-key";
import {
  buildCacheMeta,
  clearTripSearchCache,
  lookupTripSearchCache,
  materializeCachedResult,
  saveTripSearchCache,
} from "./trip-query-cache";

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
  beforeEach(() => {
    vi.stubEnv("TRIP_SEARCH_CACHE_TTL_MS", "1200000");
    clearTripSearchCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearTripSearchCache();
  });

  it("uses a stable key for equivalent search params", () => {
    const a = buildTripSearchCacheKey(params);
    const b = buildTripSearchCacheKey({
      ...params,
      flights: { ...params.flights, origin: "dxb", destination: "lon" },
    });
    expect(a).toBe(b);
  });

  it("returns miss before anything is cached", () => {
    expect(lookupTripSearchCache(params).status).toBe("miss");
  });

  it("serves fresh cache within the fixed TTL window", () => {
    const now = 1_700_000_000_000;
    saveTripSearchCache(params, minimalResult(), now);

    const lookup = lookupTripSearchCache(params, now + 10 * 60 * 1000);
    expect(lookup.status).toBe("fresh");
    expect(lookup.entry?.expiresAt).toBe(now + 20 * 60 * 1000);
  });

  it("keeps the original expiry on cache hits (10 min left, not a new 20 min window)", () => {
    const now = 1_700_000_000_000;
    saveTripSearchCache(params, minimalResult(), now);

    const atTenMinutes = now + 10 * 60 * 1000;
    const materialized = materializeCachedResult(
      lookupTripSearchCache(params, atTenMinutes).entry!,
      "req-2",
      atTenMinutes,
      "fresh",
      atTenMinutes,
    );

    expect(materialized.meta.cache.refreshInMs).toBe(10 * 60 * 1000);
    expect(materialized.meta.cache.expiresAt).toBe(new Date(now + 20 * 60 * 1000).toISOString());
  });

  it("marks cache stale after expiry", () => {
    const now = 1_700_000_000_000;
    saveTripSearchCache(params, minimalResult(), now);

    const lookup = lookupTripSearchCache(params, now + 21 * 60 * 1000);
    expect(lookup.status).toBe("stale");

    const stale = materializeCachedResult(lookup.entry!, "req-3", now + 21 * 60 * 1000, "stale");
    expect(stale.meta.cache.refreshInMs).toBe(0);
  });
});
