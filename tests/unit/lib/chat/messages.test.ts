import { describe, expect, it } from "vitest";
import { buildAssistantReply } from "@/lib/chat/messages";
import type { TripSearchParams, TripSearchResponse } from "@/lib/types/trip";

const params: TripSearchParams = {
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
  budget: { maxTotal: 3000, currency: "USD" },
};

function resultWithOffers(
  offerCount: number,
  cheapest: number | null,
  suggestedMinBudget: number | null = null,
): TripSearchResponse {
  return {
    requestId: "req-1",
    parsedQuery: params,
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
        ttlMs: 300_000,
      },
    },
    providers: {
      sabre: { domain: "flights", status: "success", offerCount, durationMs: 1 },
      amadeus: { domain: "flights", status: "success", offerCount: 0, durationMs: 1 },
      hotelbeds: { domain: "hotels", status: "success", offerCount: 0, durationMs: 1 },
    },
    flights: {
      totalOffers: offerCount,
      truncated: false,
      withinBudget: true,
      offers: Array.from({ length: offerCount }, (_, i) => ({
        id: `f${i}`,
        provider: "sabre" as const,
        totalPrice: cheapest ?? 0,
        currency: "USD",
        perPassenger: (cheapest ?? 0) / 2,
        validatingCarrier: "EK",
        stops: 0,
        durationMinutes: 480,
        segments: [],
        refundable: true,
      })),
    },
    hotels: { totalOffers: 0, truncated: false, offers: [] },
    tripSummary: {
      cheapestFlight: cheapest,
      cheapestHotel: null,
      estimatedTripTotal: null,
      currency: "USD",
      withinBudget: null,
      budgetRemaining: null,
      suggestedMinBudget,
    },
  };
}

describe("buildAssistantReply", () => {
  it("responds to looks good confirmations", () => {
    const reply = buildAssistantReply(params, null, "Looks good");
    expect(reply).toMatch(/pick a flight/i);
  });

  it("suggests raising budget when nothing fits", () => {
    const reply = buildAssistantReply(
      params,
      resultWithOffers(0, null, 3500),
      "raise budget?",
    );
    expect(reply).toMatch(/nothing fits/i);
    expect(reply).toMatch(/3,000/);
    expect(reply).toMatch(/3,500/);
  });

  it("reports offers within budget", () => {
    const reply = buildAssistantReply(params, resultWithOffers(2, 2400), "update");
    expect(reply).toMatch(/2 flights within your/i);
    expect(reply).toMatch(/2,400/);
  });

  it("uses singular flight wording for one offer within budget", () => {
    const reply = buildAssistantReply(params, resultWithOffers(1, 2400), "update");
    expect(reply).toMatch(/1 flight within your/i);
    expect(reply).not.toMatch(/flights within/i);
  });

  it("reports offers without budget context", () => {
    const noBudget = { ...params, budget: undefined };
    const reply = buildAssistantReply(noBudget, resultWithOffers(3, 1800), "update");
    expect(reply).toMatch(/3 flight options/i);
    expect(reply).toMatch(/1,800/);
  });

  it("uses singular option wording for one offer without budget", () => {
    const noBudget = { ...params, budget: undefined };
    const reply = buildAssistantReply(noBudget, resultWithOffers(1, 1800), "update");
    expect(reply).toMatch(/1 flight option/i);
    expect(reply).not.toMatch(/flight options/i);
  });

  it("falls back to searching message when no offers are available", () => {
    const reply = buildAssistantReply(
      { ...params, budget: undefined },
      resultWithOffers(0, null),
      "update",
    );
    expect(reply).toBe("Updated your trip details. Searching for the best options now.");
  });

  it("falls back to searching message when result is null", () => {
    const reply = buildAssistantReply(params, null, "update trip");
    expect(reply).toBe("Updated your trip details. Searching for the best options now.");
  });

  it("falls back when budget is set but no offers or suggested minimum exist", () => {
    const reply = buildAssistantReply(params, resultWithOffers(0, null), "update");
    expect(reply).toBe("Updated your trip details. Searching for the best options now.");
  });

  it("falls back when offers exist but cheapest price is missing", () => {
    const reply = buildAssistantReply(params, resultWithOffers(2, null), "update");
    expect(reply).toBe("Updated your trip details. Searching for the best options now.");
  });
});
