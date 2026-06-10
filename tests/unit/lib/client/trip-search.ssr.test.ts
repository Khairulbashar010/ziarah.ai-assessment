// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getTripFromCache, saveTripToCache } from "@/lib/client/trip-search";
import type { TripSearchResponse } from "@/lib/types/trip";

const minimalResponse = (): TripSearchResponse => ({
  requestId: "ssr-req",
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
    durationMs: 1,
    providersQueried: 3,
    providersSucceeded: 3,
    providersFailed: 0,
    partialResults: false,
    cache: {
      status: "miss",
      cachedAt: null,
      expiresAt: null,
      refreshInMs: null,
      ttlMs: 600_000,
    },
  },
  providers: {
    sabre: { domain: "flights", status: "success", offerCount: 1, durationMs: 1 },
    amadeus: { domain: "flights", status: "success", offerCount: 1, durationMs: 1 },
    hotelbeds: { domain: "hotels", status: "success", offerCount: 1, durationMs: 1 },
  },
  flights: { totalOffers: 0, withinBudget: true, offers: [] },
  hotels: { totalOffers: 0, offers: [] },
  tripSummary: {
    cheapestFlight: null,
    cheapestHotel: null,
    estimatedTripTotal: null,
    currency: "USD",
    withinBudget: null,
    budgetRemaining: null,
    suggestedMinBudget: null,
  },
});

describe("trip-search client without window", () => {
  it("no-ops cache reads and writes during SSR", () => {
    saveTripToCache("ssr-req", "server query", minimalResponse());
    expect(getTripFromCache("ssr-req")).toBeUndefined();
  });
});
