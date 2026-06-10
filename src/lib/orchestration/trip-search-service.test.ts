import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearTripSearchCache } from "@/lib/storage/trip-query-cache";
import { searchTrip, QuorumError } from "./trip-search-service";

describe("trip search orchestrator", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LLM", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");
    clearTripSearchCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearTripSearchCache();
  });

  it("returns flights and hotels when all 3 providers succeed (2-of-3 quorum)", async () => {
    const result = await searchTrip(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(result.meta.providersSucceeded).toBe(3);
    expect(result.flights.offers.length).toBeGreaterThan(0);
    expect(result.hotels.offers.length).toBeGreaterThan(0);
    expect(result.tripSummary.estimatedTripTotal).not.toBeNull();
    expect(result.parsedQuery.flights.origin).toBe("DXB");
    expect(result.parsedQuery.hotels.destinationCode).toBe("LON");
  });

  it("fails with QuorumError when fewer than 2 providers succeed", async () => {
    const error = await searchTrip(
      "family of 4 from fail to London, December 20-27, budget $3000",
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(QuorumError);
    if (error instanceof QuorumError) {
      expect(error.details.providersSucceeded).toBeLessThan(2);
      expect(error.details.providers.sabre.status).not.toBe("success");
      expect(error.details.route).toBe("ZZZ → LON");
    }
  });

  it("only returns offers that can form a trip within the customer budget", async () => {
    const result = await searchTrip(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(result.parsedQuery.budget?.maxTotal).toBe(3000);

    for (const flight of result.flights.offers) {
      const hasCompatibleHotel = result.hotels.offers.some(
        (hotel) => flight.totalPrice + hotel.totalPrice <= 3000,
      );
      expect(hasCompatibleHotel).toBe(true);
    }

    for (const hotel of result.hotels.offers) {
      const hasCompatibleFlight = result.flights.offers.some(
        (flight) => flight.totalPrice + hotel.totalPrice <= 3000,
      );
      expect(hasCompatibleFlight).toBe(true);
    }
  });

  it("suggests increasing budget when no options fit", async () => {
    const result = await searchTrip(
      "family of 4 from Dubai to London, December 20-27, budget $500",
    );

    expect(result.flights.offers).toHaveLength(0);
    expect(result.hotels.offers).toHaveLength(0);
    expect(result.tripSummary.suggestedMinBudget).not.toBeNull();
    expect(result.tripSummary.suggestedMinBudget).toBeGreaterThan(500);
  });
});
