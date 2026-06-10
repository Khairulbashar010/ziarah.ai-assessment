import { describe, expect, it } from "vitest";
import { buildTripSearchCacheKey } from "@/lib/trip-search/cache-key";
import type { TripSearchParams } from "@/lib/types/trip";

const baseParams: TripSearchParams = {
  tripType: "ROUND_TRIP",
  flights: {
    origin: "dxb",
    destination: "lon",
    departureDate: "2026-12-20",
    returnDate: "2026-12-27",
    passengers: { adults: 2, children: 0, infants: 0 },
    cabin: "ECONOMY",
  },
  hotels: {
    destination: "London",
    destinationCode: "lon",
    checkIn: "2026-12-20",
    checkOut: "2026-12-27",
    occupancies: [{ rooms: 1, adults: 2, children: 0 }],
  },
  budget: { maxTotal: 5000, currency: "USD" },
};

describe("buildTripSearchCacheKey", () => {
  it("normalizes airport codes and omits optional fields consistently", () => {
    const withBudget = buildTripSearchCacheKey(baseParams);
    const withoutBudget = buildTripSearchCacheKey({ ...baseParams, budget: undefined });
    const oneWay = buildTripSearchCacheKey({
      ...baseParams,
      tripType: "ONE_WAY",
      flights: { ...baseParams.flights, returnDate: undefined },
    });

    expect(withBudget).toHaveLength(64);
    expect(withBudget).not.toBe(withoutBudget);
    expect(oneWay).not.toBe(withBudget);
  });

  it("includes direct-flight preference from nonStop or flight preferences", () => {
    const fromFlag = buildTripSearchCacheKey({
      ...baseParams,
      flights: { ...baseParams.flights, nonStop: true },
    });
    const fromPreference = buildTripSearchCacheKey({
      ...baseParams,
      preferences: { flights: { stops: "direct", sort: "best" } },
    });
    const withoutDirect = buildTripSearchCacheKey(baseParams);

    expect(fromFlag).toBe(fromPreference);
    expect(fromFlag).not.toBe(withoutDirect);
  });
});
