import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearTripSearchCache } from "@/lib/storage/trip-query-cache";
import { searchTrip, QuorumError } from "@/lib/orchestration/trip-search-service";
import { buildSabreOtaResponse } from "@/mocks/handlers/sabre-ota-bfm";
import { buildAmadeusFlightOffersResponse } from "@/mocks/handlers/amadeus-flights";

describe("trip search orchestrator", () => {
  beforeEach(async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LLM", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");
    await clearTripSearchCache();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await clearTripSearchCache();
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

  it("retries failed providers once and recovers quorum when retry succeeds", async () => {
    const sabreClient = await import("@/lib/providers/sabre/client");
    const amadeusClient = await import("@/lib/providers/amadeus/client");
    const sabreCalls = { count: 0 };
    const amadeusCalls = { count: 0 };

    const sabreSpy = vi.spyOn(sabreClient, "searchSabreFlights").mockImplementation(async (params) => {
      sabreCalls.count += 1;
      if (sabreCalls.count === 1) {
        throw new Error("Sabre transient");
      }
      return buildSabreOtaResponse(params);
    });
    const amadeusSpy = vi
      .spyOn(amadeusClient, "searchAmadeusFlights")
      .mockImplementation(async (params) => {
        amadeusCalls.count += 1;
        if (amadeusCalls.count === 1) {
          throw new Error("Amadeus transient");
        }
        return buildAmadeusFlightOffersResponse(params);
      });

    const result = await searchTrip(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(sabreCalls.count).toBe(2);
    expect(amadeusCalls.count).toBe(2);
    expect(result.meta.providersSucceeded).toBe(3);
    expect(result.flights.offers.length).toBeGreaterThan(0);
    expect(result.hotels.offers.length).toBeGreaterThan(0);

    sabreSpy.mockRestore();
    amadeusSpy.mockRestore();
  });

  it("skips quorum retry when PROVIDER_QUORUM_RETRY=false", async () => {
    vi.stubEnv("PROVIDER_QUORUM_RETRY", "false");

    const sabreClient = await import("@/lib/providers/sabre/client");
    const amadeusClient = await import("@/lib/providers/amadeus/client");
    const sabreCalls = { count: 0 };
    const amadeusCalls = { count: 0 };

    const sabreSpy = vi.spyOn(sabreClient, "searchSabreFlights").mockImplementation(async (params) => {
      sabreCalls.count += 1;
      if (sabreCalls.count === 1) {
        throw new Error("Sabre transient");
      }
      return buildSabreOtaResponse(params);
    });
    const amadeusSpy = vi
      .spyOn(amadeusClient, "searchAmadeusFlights")
      .mockImplementation(async (params) => {
        amadeusCalls.count += 1;
        if (amadeusCalls.count === 1) {
          throw new Error("Amadeus transient");
        }
        return buildAmadeusFlightOffersResponse(params);
      });

    const error = await searchTrip(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(QuorumError);
    expect(sabreCalls.count).toBe(1);
    expect(amadeusCalls.count).toBe(1);

    sabreSpy.mockRestore();
    amadeusSpy.mockRestore();
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

  it("accepts prior trip context for follow-up parsing", async () => {
    const first = await searchTrip(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );
    const second = await searchTrip("increase budget to $8000", "follow-up-req", first.parsedQuery);

    expect(second.parsedQuery.budget?.maxTotal).toBe(8000);
    expect(second.parsedQuery.flights.origin).toBe("DXB");
  });

  it("computes trip summary without a budget constraint", async () => {
    const result = await searchTrip("family of 4 from Dubai to London, December 20-27");

    expect(result.parsedQuery.budget).toBeUndefined();
    expect(result.tripSummary.withinBudget).toBeNull();
    expect(result.tripSummary.budgetRemaining).toBeNull();
    expect(result.tripSummary.estimatedTripTotal).not.toBeNull();
  });

  it("uses a generated request id when none is supplied", async () => {
    const result = await searchTrip(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(result.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("falls back to hotel currency in trip summary when flights are empty", async () => {
    const hotelbedsClient = await import("@/lib/providers/hotelbeds/client");
    const sabreClient = await import("@/lib/providers/sabre/client");
    const amadeusClient = await import("@/lib/providers/amadeus/client");

    const hotelSpy = vi.spyOn(hotelbedsClient, "searchHotelBedsHotels").mockResolvedValue({
      hotels: {
        hotels: [
          {
            code: 1,
            name: "Test",
            categoryCode: "4EST",
            currency: "EUR",
            rooms: [
              {
                code: "DBL",
                name: "Double",
                rates: [{ net: "400.00", rateType: "BOOKABLE", boardCode: "BB" }],
              },
            ],
          },
        ],
      },
    });
    const sabreSpy = vi.spyOn(sabreClient, "searchSabreFlights").mockResolvedValue({ groupedItineraryResponse: { itineraryGroups: [] } });
    const amadeusSpy = vi.spyOn(amadeusClient, "searchAmadeusFlights").mockResolvedValue({ data: [] });

    const result = await searchTrip("family of 4 from Dubai to London, December 20-27");

    expect(result.flights.offers).toHaveLength(0);
    expect(result.hotels.offers.length).toBeGreaterThan(0);
    expect(result.tripSummary.currency).toBe("EUR");

    hotelSpy.mockRestore();
    sabreSpy.mockRestore();
    amadeusSpy.mockRestore();
  });

  it("marks partial stream snapshots as incomplete while providers are pending", async () => {
    const { searchTripStream } = await import("@/lib/orchestration/trip-search-service");
    const events = [];
    for await (const event of searchTripStream(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
      "partial-req",
    )) {
      events.push(event);
      const providerCount = events.filter((e) => e.type === "provider").length;
      const hasPartialUpdate = events.some((e) => e.type === "offers_update");
      if (providerCount === 1 && hasPartialUpdate) {
        break;
      }
    }

    const partialUpdate = events.find((e) => e.type === "offers_update");
    expect(partialUpdate?.type).toBe("offers_update");
    if (partialUpdate?.type === "offers_update") {
      expect(partialUpdate.update.meta.partialResults).toBe(true);
      expect(partialUpdate.update.providers.sabre.status).not.toBe("pending");
      expect(
        [partialUpdate.update.providers.amadeus.status, partialUpdate.update.providers.hotelbeds.status].some(
          (status) => status === "pending",
        ),
      ).toBe(true);
    }
  });
});
