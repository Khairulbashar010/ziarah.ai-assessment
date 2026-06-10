import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TripSearchParams } from "@/lib/types/trip";
import { buildTripSearchShell } from "@/lib/client/trip-search-shell";

const parsedQuery: TripSearchParams = {
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
  budget: { maxTotal: 3000, currency: "EUR" },
};

describe("buildTripSearchShell", () => {
  beforeEach(() => {
    vi.stubEnv("TRIP_SEARCH_CACHE_TTL_MS", "120000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a partial response shell for immediate rendering", () => {
    const shell = buildTripSearchShell("req-shell", parsedQuery);

    expect(shell.requestId).toBe("req-shell");
    expect(shell.parsedQuery).toBe(parsedQuery);
    expect(shell.meta.partialResults).toBe(true);
    expect(shell.meta.providersSucceeded).toBe(0);
    expect(shell.meta.cache.status).toBe("miss");
    expect(shell.meta.cache.ttlMs).toBe(120_000);
    expect(shell.providers.sabre.status).toBe("pending");
    expect(shell.providers.amadeus.status).toBe("pending");
    expect(shell.providers.hotelbeds.status).toBe("pending");
    expect(shell.flights.offers).toEqual([]);
    expect(shell.hotels.offers).toEqual([]);
    expect(shell.tripSummary.currency).toBe("EUR");
    expect(shell.tripSummary.cheapestFlight).toBeNull();
  });

  it("defaults cache ttl and currency when budget is absent", () => {
    vi.unstubAllEnvs();

    const shell = buildTripSearchShell("req-default", {
      ...parsedQuery,
      budget: undefined,
    });

    expect(shell.meta.cache.ttlMs).toBe(300_000);
    expect(shell.tripSummary.currency).toBe("USD");
  });
});
