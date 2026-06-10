import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TripSearchResult } from "@/lib/types/trip";
import { applyOffersUpdate, toClientOffersUpdate, toClientTripResponse } from "./client-payload";

function flight(id: string, price: number) {
  return {
    id,
    provider: "sabre" as const,
    totalPrice: price,
    currency: "USD",
    perPassenger: price,
    validatingCarrier: "AA",
    stops: 0,
    durationMinutes: 480,
    segments: [],
    refundable: true,
    raw: { bulky: "gds-payload", index: id },
  };
}

function hotel(id: string, price: number) {
  return {
    id,
    provider: "hotelbeds" as const,
    hotelCode: 1,
    hotelName: "Test Hotel",
    destinationCode: "LON",
    category: "4EST",
    checkIn: "2025-12-20",
    checkOut: "2025-12-27",
    nights: 7,
    roomName: "Double",
    boardName: "BB",
    totalPrice: price,
    currency: "USD",
    rateType: "BOOKABLE" as const,
    cancellationPolicies: [],
    raw: { bulky: "hotel-payload", index: id },
  };
}

function baseResult(overrides?: Partial<TripSearchResult>): TripSearchResult {
  return {
    requestId: "req-1",
    parsedQuery: {
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
      tripType: "ROUND_TRIP",
    },
    meta: {
      durationMs: 10,
      providersQueried: 3,
      providersSucceeded: 3,
      providersFailed: 0,
      partialResults: false,
      cache: {
        status: "miss",
        cachedAt: "2025-01-01T00:00:00.000Z",
        expiresAt: "2025-01-01T00:05:00.000Z",
        refreshInMs: 300_000,
        ttlMs: 300_000,
      },
    },
    providers: {
      sabre: { domain: "flights", status: "success", offerCount: 60, durationMs: 100 },
      amadeus: { domain: "flights", status: "success", offerCount: 60, durationMs: 120 },
      hotelbeds: { domain: "hotels", status: "success", offerCount: 40, durationMs: 90 },
    },
    flights: {
      totalOffers: 60,
      withinBudget: true,
      offers: Array.from({ length: 60 }, (_, i) => flight(`f-${i}`, 900 + i)),
    },
    hotels: {
      totalOffers: 40,
      offers: Array.from({ length: 40 }, (_, i) => hotel(`h-${i}`, 500 + i)),
    },
    tripSummary: {
      cheapestFlight: 900,
      cheapestHotel: 500,
      estimatedTripTotal: 1400,
      currency: "USD",
      withinBudget: true,
      budgetRemaining: 1600,
      suggestedMinBudget: null,
    },
    ...overrides,
  };
}

describe("client payload", () => {
  beforeEach(() => {
    vi.stubEnv("CLIENT_MAX_FLIGHT_OFFERS", "50");
    vi.stubEnv("CLIENT_MAX_HOTEL_OFFERS", "30");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("strips raw payloads and caps offers for the client", () => {
    const client = toClientTripResponse(baseResult());

    expect(client.flights.offers).toHaveLength(50);
    expect(client.flights.totalOffers).toBe(60);
    expect(client.flights.truncated).toBe(true);
    expect(client.hotels.offers).toHaveLength(30);
    expect(client.hotels.totalOffers).toBe(40);
    expect(client.hotels.truncated).toBe(true);
    expect(client.flights.offers[0]).not.toHaveProperty("raw");
    expect(client.hotels.offers[0]).not.toHaveProperty("raw");
  });

  it("marks truncated false when under the cap", () => {
    const client = toClientTripResponse(
      baseResult({
        flights: { totalOffers: 3, withinBudget: true, offers: [flight("f-1", 100)] },
        hotels: { totalOffers: 2, offers: [hotel("h-1", 200)] },
      }),
    );

    expect(client.flights.truncated).toBe(false);
    expect(client.hotels.truncated).toBe(false);
  });

  it("builds lightweight offers_update chunks without parsedQuery", () => {
    const update = toClientOffersUpdate(baseResult());

    expect(update).not.toHaveProperty("parsedQuery");
    expect(update.flights.offers).toHaveLength(50);
    expect(update.meta.providersSucceeded).toBe(3);
  });

  it("merges offers_update into an existing client response", () => {
    const shell = toClientTripResponse(
      baseResult({
        flights: { totalOffers: 0, withinBudget: true, offers: [] },
        hotels: { totalOffers: 0, offers: [] },
        meta: { ...baseResult().meta, partialResults: true, providersSucceeded: 0 },
      }),
    );
    const update = toClientOffersUpdate(baseResult());

    const merged = applyOffersUpdate(shell, update);

    expect(merged.requestId).toBe("req-1");
    expect(merged.parsedQuery.flights.origin).toBe("DXB");
    expect(merged.flights.offers).toHaveLength(50);
    expect(merged.meta.providersSucceeded).toBe(3);
  });
});
