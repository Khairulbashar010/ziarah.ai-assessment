import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { GET } from "@/app/api/trips/[id]/route";
import { saveTripResult } from "@/lib/storage/trip-results";
import type { TripSearchResult } from "@/lib/types/trip";

const { getTripResultMock } = vi.hoisted(() => ({
  getTripResultMock: vi.fn(),
}));

vi.mock("@/lib/storage/trip-results", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/trip-results")>();
  return {
    ...actual,
    getTripResult: getTripResultMock,
  };
});

function makeGetRequest(): NextRequest {
  return new Request("http://localhost/api/trips/req-found") as NextRequest;
}

const storedResult = (): TripSearchResult => ({
  requestId: "req-found",
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
      status: "fresh",
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      refreshInMs: 600_000,
      ttlMs: 600_000,
    },
  },
  providers: {
    sabre: { domain: "flights", status: "success", offerCount: 1, durationMs: 1 },
    amadeus: { domain: "flights", status: "success", offerCount: 1, durationMs: 1 },
    hotelbeds: { domain: "hotels", status: "success", offerCount: 1, durationMs: 1 },
  },
  flights: { totalOffers: 1, withinBudget: true, offers: [] },
  hotels: { totalOffers: 1, offers: [] },
  tripSummary: {
    cheapestFlight: 500,
    cheapestHotel: 400,
    estimatedTripTotal: 900,
    currency: "USD",
    withinBudget: true,
    budgetRemaining: 2100,
    suggestedMinBudget: null,
  },
});

describe("GET /api/trips/[id]", () => {
  beforeEach(async () => {
    getTripResultMock.mockReset();
    getTripResultMock.mockImplementation(actualGetTripResult);
    await saveTripResult(storedResult());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function actualGetTripResult(requestId: string) {
    const { getTripResult } = await vi.importActual<typeof import("@/lib/storage/trip-results")>(
      "@/lib/storage/trip-results",
    );
    return getTripResult(requestId);
  }

  it("returns 200 with client payload when trip exists", async () => {
    const response = await GET(makeGetRequest(), {
      params: Promise.resolve({ id: "req-found" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe("req-found");
    expect(body.tripSummary.estimatedTripTotal).toBe(900);
  });

  it("returns 404 when trip is not found", async () => {
    const response = await GET(makeGetRequest(), {
      params: Promise.resolve({ id: "missing-id" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Trip not found");
  });

  it("returns 500 when loading the trip fails", async () => {
    getTripResultMock.mockRejectedValue(new Error("redis unavailable"));

    const response = await GET(makeGetRequest(), {
      params: Promise.resolve({ id: "req-found" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});
