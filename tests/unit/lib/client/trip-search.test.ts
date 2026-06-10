// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchTripResult,
  getTripFromCache,
  saveTripToCache,
  searchTripClient,
  searchTripClientStream,
} from "@/lib/client/trip-search";
import type { TripSearchResponse } from "@/lib/types/trip";
import { USER_ERRORS } from "@/lib/user-messages";

const minimalResponse = (): TripSearchResponse => ({
  requestId: "client-req-1",
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

function encodeSse(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

describe("trip-search client", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("searchTripClient includes trip context in the request body when provided", async () => {
    const result = minimalResponse();
    const context = result.parsedQuery;
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => result,
    } as Response);

    await searchTripClient("increase budget to $8000", undefined, context);

    expect(fetch).toHaveBeenCalledWith("/api/trips/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "increase budget to $8000", context }),
    });
  });

  it("searchTripClient posts to the search API and caches the result", async () => {
    const result = minimalResponse();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => result,
    } as Response);

    const requestId = "550e8400-e29b-41d4-a716-446655440000";
    const response = await searchTripClient("trip to London", requestId);

    expect(fetch).toHaveBeenCalledWith("/api/trips/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({ query: "trip to London" }),
    });
    expect(response.requestId).toBe("client-req-1");
    expect(getTripFromCache("client-req-1")?.query).toBe("trip to London");
  });

  it("searchTripClientStream throws on non-ok HTTP responses", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid request body" }),
    } as Response);

    await expect(
      searchTripClientStream("trip to London", { onEvent: () => {} }),
    ).rejects.toThrow(USER_ERRORS.parse);
  });

  it("searchTripClient throws a user-friendly error on failure", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "Could not parse travel query" }),
    } as Response);

    await expect(searchTripClient("bad query")).rejects.toThrow(USER_ERRORS.parse);
  });

  it("searchTripClient falls back when error bodies cannot be parsed", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("invalid json");
      },
    } as Response);

    await expect(searchTripClient("bad query")).rejects.toThrow(USER_ERRORS.generic);
  });

  it("searchTripClientStream forwards request id, context, and skips malformed SSE chunks", async () => {
    const result = minimalResponse();
    const context = result.parsedQuery;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(": keep-alive\n\n"));
        controller.enqueue(encodeSse({ type: "status", message: "Searching...", progress: 50 }));
        controller.enqueue(new TextEncoder().encode("data: \n\n"));
        controller.enqueue(encodeSse({ type: "complete", result }));
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const events: string[] = [];
    const requestId = "6ba7b811-9dad-4d1a-80b4-00c04fd430c8";
    await searchTripClientStream(
      "increase budget to $8000",
      {
        requestId,
        onEvent: (event) => {
          events.push(event.type);
        },
      },
      context,
    );

    expect(fetch).toHaveBeenCalledWith("/api/trips/search/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({ query: "increase budget to $8000", context }),
    });
    expect(events).toEqual(["status", "complete"]);
  });

  it("searchTripClientStream reads SSE events and caches the final result", async () => {
    const result = minimalResponse();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encodeSse({ type: "status", message: "Searching...", progress: 50 }),
        );
        controller.enqueue(encodeSse({ type: "complete", result }));
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const events: string[] = [];
    const finalResult = await searchTripClientStream(
      "trip to London",
      {
        requestId: "stream-req",
        onEvent: (event) => {
          events.push(event.type);
        },
      },
    );

    expect(events).toEqual(["status", "complete"]);
    expect(finalResult?.requestId).toBe("client-req-1");
    expect(getTripFromCache("client-req-1")?.result.requestId).toBe("client-req-1");
  });

  it("searchTripClientStream throws on stream error events", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encodeSse({
            type: "error",
            message: "Fewer than 2 of 3 providers succeeded",
            status: 503,
          }),
        );
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    await expect(
      searchTripClientStream("trip to London", { onEvent: () => {} }),
    ).rejects.toThrow(USER_ERRORS.quorum);
  });

  it("searchTripClientStream throws when the response body is missing", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: null,
    } as Response);

    await expect(
      searchTripClientStream("trip to London", { onEvent: () => {} }),
    ).rejects.toThrow(USER_ERRORS.generic);
  });

  it("tolerates corrupt sessionStorage cache payloads", () => {
    sessionStorage.setItem("ziarah-trip-results", "{not-json");
    expect(getTripFromCache("any")).toBeUndefined();
  });

  it("saveTripToCache and getTripFromCache round-trip entries", () => {
    const result = minimalResponse();
    saveTripToCache("cache-id", "saved query", result);

    const cached = getTripFromCache("cache-id");
    expect(cached?.query).toBe("saved query");
    expect(cached?.result.requestId).toBe("client-req-1");
  });

  it("fetchTripResult returns session cache before calling the API", async () => {
    const result = minimalResponse();
    saveTripToCache("cached-req", "cached query", result);

    const fetched = await fetchTripResult("cached-req");
    expect(fetched?.requestId).toBe("client-req-1");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetchTripResult fetches from the API on cache miss", async () => {
    const result = minimalResponse();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => result,
    } as Response);

    const fetched = await fetchTripResult("remote-req");
    expect(fetch).toHaveBeenCalledWith("/api/trips/remote-req");
    expect(fetched?.requestId).toBe("client-req-1");
  });

  it("fetchTripResult returns null when the API responds with an error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await expect(fetchTripResult("missing-req")).resolves.toBeNull();
  });

  it("searchTripClientStream omits the request id header when not provided", async () => {
    const result = minimalResponse();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeSse({ type: "complete", result }));
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    await searchTripClientStream("trip to London", { onEvent: () => {} });

    expect(fetch).toHaveBeenCalledWith("/api/trips/search/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "trip to London" }),
    });
  });

  it("searchTripClientStream returns null when the stream ends without a complete event", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encodeSse({ type: "status", message: "Searching...", progress: 10 }),
        );
        controller.close();
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      body: stream,
    } as Response);

    const finalResult = await searchTripClientStream("trip to London", {
      onEvent: () => {},
    });

    expect(finalResult).toBeNull();
    expect(getTripFromCache("client-req-1")).toBeUndefined();
  });
});
