import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TripSearchResult } from "@/lib/types/trip";
import * as redis from "@/lib/storage/redis";
import { clearRedisNamespace, redisSet } from "@/lib/storage/redis";
import { redisKeys, TRIP_RESULT_TTL_SECONDS } from "@/lib/storage/redis-keys";
import {
  deleteTripResult,
  getTripResult,
  saveTripResult,
} from "@/lib/storage/trip-results";

function makeResult(requestId: string): TripSearchResult {
  return {
    requestId,
    parsedQuery: {
      tripType: "ROUND_TRIP",
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 0 }],
      },
    },
    meta: {
      durationMs: 10,
      providersQueried: 3,
      providersSucceeded: 3,
      providersFailed: 0,
      partialResults: false,
      cache: {
        status: "miss",
        cachedAt: null,
        expiresAt: null,
        refreshInMs: null,
        ttlMs: 300_000,
      },
    },
    providers: {
      sabre: { domain: "flights", status: "success", offerCount: 1, durationMs: 1 },
      amadeus: { domain: "flights", status: "success", offerCount: 1, durationMs: 1 },
      hotelbeds: { domain: "hotels", status: "success", offerCount: 1, durationMs: 1 },
    },
    flights: { totalOffers: 1, truncated: false, withinBudget: true, offers: [] },
    hotels: { totalOffers: 1, truncated: false, offers: [] },
    tripSummary: {
      cheapestFlight: 1200,
      cheapestHotel: 800,
      estimatedTripTotal: 2000,
      currency: "USD",
      withinBudget: true,
      budgetRemaining: 1000,
      suggestedMinBudget: null,
    },
  };
}

describe("trip-results store", () => {
  beforeEach(async () => {
    await clearRedisNamespace();
  });

  afterEach(async () => {
    await clearRedisNamespace();
    vi.unstubAllEnvs();
  });

  it("saves and retrieves results by request id", async () => {
    const result = makeResult("req-save");
    await saveTripResult(result);

    expect(await getTripResult("req-save")).toEqual(result);
  });

  it("stores results with the configured TTL", async () => {
    const setSpy = vi.spyOn(redis, "redisSet");
    const result = makeResult("req-ttl");
    await saveTripResult(result);

    expect(setSpy).toHaveBeenCalledWith(
      redisKeys.result("req-ttl"),
      JSON.stringify(result),
      { EX: TRIP_RESULT_TTL_SECONDS },
    );

    setSpy.mockRestore();
  });

  it("returns undefined for unknown request ids", async () => {
    expect(await getTripResult("missing-request")).toBeUndefined();
  });

  it("returns undefined when stored JSON is invalid", async () => {
    await redisSet(redisKeys.result("bad-json"), "{not-json", {
      EX: TRIP_RESULT_TTL_SECONDS,
    });

    expect(await getTripResult("bad-json")).toBeUndefined();
  });

  it("overwrites an existing entry with the same request id", async () => {
    const first = makeResult("req-overwrite");
    const second = {
      ...makeResult("req-overwrite"),
      tripSummary: { ...makeResult("req-overwrite").tripSummary, cheapestFlight: 999 },
    };

    await saveTripResult(first);
    await saveTripResult(second);

    expect((await getTripResult("req-overwrite"))?.tripSummary.cheapestFlight).toBe(999);
  });

  it("deletes a stored result", async () => {
    const result = makeResult("req-delete");
    await saveTripResult(result);
    expect(await getTripResult("req-delete")).toEqual(result);

    await deleteTripResult("req-delete");
    expect(await getTripResult("req-delete")).toBeUndefined();
  });
});
