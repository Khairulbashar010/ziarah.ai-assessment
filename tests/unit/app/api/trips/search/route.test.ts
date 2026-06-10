import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/trips/search/route";
import { QuorumError } from "@/lib/orchestration/trip-search-service";
import type { TripSearchResult } from "@/lib/types/trip";
import { USER_ERRORS } from "@/lib/user-messages";

const { searchTripMock, withTimeoutMock } = vi.hoisted(() => ({
  searchTripMock: vi.fn(),
  withTimeoutMock: vi.fn(
    <T,>(promise: Promise<T>) => promise,
  ),
}));

vi.mock("@/lib/orchestration/trip-search-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orchestration/trip-search-service")>();
  return {
    ...actual,
    searchTrip: searchTripMock,
  };
});

vi.mock("@/lib/resilience/with-timeout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resilience/with-timeout")>();
  return {
    ...actual,
    withTimeout: withTimeoutMock,
  };
});

function makeRequest(body: unknown, headers?: Record<string, string>): NextRequest {
  return new Request("http://localhost/api/trips/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

const minimalResult = (): TripSearchResult => ({
  requestId: "req-test",
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

describe("POST /api/trips/search", () => {
  beforeEach(() => {
    searchTripMock.mockReset();
    withTimeoutMock.mockImplementation(<T,>(promise: Promise<T>) => promise);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 200 with client payload on success", async () => {
    searchTripMock.mockResolvedValue(minimalResult());

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe("req-test");
    expect(searchTripMock).toHaveBeenCalledWith(
      "family of 4 from Dubai to London, December 20-27",
      expect.any(String),
      undefined,
    );
  });

  it("returns 400 for invalid request body (Zod)", async () => {
    const response = await POST(makeRequest({ query: "ab" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(USER_ERRORS.parse);
    expect(searchTripMock).not.toHaveBeenCalled();
  });

  it("returns 503 for QuorumError", async () => {
    searchTripMock.mockRejectedValue(
      new QuorumError({
        requestId: "req-q",
        providersSucceeded: 1,
        providersRequired: 2,
        providerTimeoutMs: 2500,
        route: "DXB → LON",
        providers: {
          sabre: { domain: "flights", status: "error", offerCount: 0, durationMs: 1 },
          amadeus: { domain: "flights", status: "success", offerCount: 1, durationMs: 1 },
          hotelbeds: { domain: "hotels", status: "success", offerCount: 1, durationMs: 1 },
        },
      }),
    );

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe(USER_ERRORS.quorum);
  });

  it("returns 422 when parse fails", async () => {
    searchTripMock.mockRejectedValue(new Error("Could not parse travel query"));

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe(USER_ERRORS.parse);
  });

  it("returns 504 on global timeout", async () => {
    withTimeoutMock.mockRejectedValue(new Error("Global timed out"));

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body.error).toBe(USER_ERRORS.timeout);
  });

  it("returns 500 for unexpected errors", async () => {
    searchTripMock.mockRejectedValue(new Error("internal server error"));

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe(USER_ERRORS.generic);
  });

  it("forwards context to searchTrip when provided", async () => {
    searchTripMock.mockResolvedValue(minimalResult());
    const context = minimalResult().parsedQuery;

    await POST(
      makeRequest({
        query: "increase budget to $8000",
        context,
      }),
    );

    expect(searchTripMock).toHaveBeenCalledWith(
      "increase budget to $8000",
      expect.any(String),
      context,
    );
  });

  it("forwards a valid UUID v4 x-request-id header to searchTrip", async () => {
    searchTripMock.mockResolvedValue(minimalResult());
    const requestId = "550e8400-e29b-41d4-a716-446655440000";

    await POST(
      makeRequest(
        { query: "family of 4 from Dubai to London, December 20-27" },
        { "x-request-id": requestId },
      ),
    );

    expect(searchTripMock).toHaveBeenCalledWith(
      expect.any(String),
      requestId,
      undefined,
    );
  });

  it("ignores invalid x-request-id headers", async () => {
    searchTripMock.mockResolvedValue(minimalResult());

    await POST(
      makeRequest(
        { query: "family of 4 from Dubai to London, December 20-27" },
        { "x-request-id": "custom-req-id" },
      ),
    );

    const [, forwardedId] = searchTripMock.mock.calls[0] ?? [];
    expect(forwardedId).not.toBe("custom-req-id");
    expect(forwardedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
