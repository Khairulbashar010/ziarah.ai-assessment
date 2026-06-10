import type { TripSearchParams, TripSearchResponse } from "@/lib/types/trip";

/** Minimal response shell so the results panel can render before any provider returns. */
export function buildTripSearchShell(
  requestId: string,
  parsedQuery: TripSearchParams,
): TripSearchResponse {
  return {
    requestId,
    parsedQuery,
    meta: {
      durationMs: 0,
      providersQueried: 3,
      providersSucceeded: 0,
      providersFailed: 0,
      partialResults: true,
      cache: {
        status: "miss",
        cachedAt: null,
        expiresAt: null,
        refreshInMs: null,
        ttlMs: Number(process.env.TRIP_SEARCH_CACHE_TTL_MS ?? 5 * 60 * 1000),
      },
    },
    providers: {
      sabre: { domain: "flights", status: "pending", offerCount: 0, durationMs: 0 },
      amadeus: { domain: "flights", status: "pending", offerCount: 0, durationMs: 0 },
      hotelbeds: { domain: "hotels", status: "pending", offerCount: 0, durationMs: 0 },
    },
    flights: { totalOffers: 0, truncated: false, withinBudget: true, offers: [] },
    hotels: { totalOffers: 0, truncated: false, offers: [] },
    tripSummary: {
      cheapestFlight: null,
      cheapestHotel: null,
      estimatedTripTotal: null,
      currency: parsedQuery.budget?.currency ?? "USD",
      withinBudget: null,
      budgetRemaining: null,
      suggestedMinBudget: null,
    },
  };
}
