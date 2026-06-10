import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHotelBedsAvailabilityResponse } from "@/mocks/handlers/hotelbeds-availability";
import * as hotelbedsMockaroo from "@/lib/providers/hotelbeds/mockaroo";
import * as hotelSeed from "@/mocks/seed/hotel-seed";

describe("buildHotelBedsAvailabilityResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseParams = {
    destination: "London",
    destinationCode: "LON",
    checkIn: "2026-12-20",
    checkOut: "2026-12-27",
    occupancies: [{ rooms: 1, adults: 2, children: 0 }],
  };

  it("returns empty hotels for unknown destinations", async () => {
    const response = await buildHotelBedsAvailabilityResponse({
      ...baseParams,
      destinationCode: "ZZZ",
      destination: "Nowhere",
    });

    expect(response.hotels.total).toBe(0);
    expect(response.hotels.hotels).toEqual([]);
  });

  it("uses default occupancy when occupancies array is empty", async () => {
    const response = await buildHotelBedsAvailabilityResponse({
      ...baseParams,
      occupancies: [],
    });

    expect(response.hotels.total).toBeGreaterThan(0);
    const rate = response.hotels.hotels[0].rooms[0].rates[0];
    expect(rate.rooms).toBe(1);
    expect(rate.adults).toBe(2);
    expect(rate.children).toBe(0);
  });

  it("includes destination names for curated codes and falls back for others", async () => {
    const london = await buildHotelBedsAvailabilityResponse(baseParams);
    expect(london.hotels.hotels[0].destinationName).toBe("London");

    const generated = await buildHotelBedsAvailabilityResponse({
      ...baseParams,
      destinationCode: "SYD",
      destination: "Sydney",
    });
    expect(generated.hotels.hotels[0].destinationName).toBe("SYD");
    expect(generated.hotels.hotels[0].zoneName).toBe("Central");
  });

  it("covers each board code variant across generated hotels", async () => {
    vi.spyOn(hotelbedsMockaroo, "fetchMockarooHotelbedsSeeds").mockResolvedValue(null);
    vi.spyOn(hotelSeed, "resolveHotelsForDestination").mockReturnValue([
      {
        code: 10001,
        name: "Hotel A",
        destinationCode: "LON",
        category: "3 STARS",
        lat: 51.5,
        lng: -0.1,
        pricePerNight: 100,
      },
      {
        code: 10002,
        name: "Hotel B",
        destinationCode: "LON",
        category: "4 STARS",
        lat: 51.51,
        lng: -0.11,
        pricePerNight: 120,
      },
      {
        code: 10003,
        name: "Hotel C",
        destinationCode: "LON",
        category: "5 STARS",
        lat: 51.52,
        lng: -0.12,
        pricePerNight: 140,
      },
    ]);

    const response = await buildHotelBedsAvailabilityResponse(baseParams);

    const boardCodes = new Set(
      response.hotels.hotels.flatMap((hotel) =>
        hotel.rooms[0].rates.map((rate) => rate.boardCode),
      ),
    );

    expect(boardCodes.has("BB")).toBe(true);
    expect(boardCodes.has("RO")).toBe(true);
    expect(boardCodes.has("HB")).toBe(true);
  });

  it("uses Mockaroo seeds when an API key is configured", async () => {
    vi.spyOn(hotelbedsMockaroo, "fetchMockarooHotelbedsSeeds").mockResolvedValue([
      {
        nightlyNet: 150,
        taxPerNight: 18,
        allotment: 6,
        exclusiveDeal: 2,
        boardCode: "BB",
        rateType: "BOOKABLE",
        zoneCode: 70,
      },
    ]);

    const response = await buildHotelBedsAvailabilityResponse(baseParams);

    expect(hotelbedsMockaroo.fetchMockarooHotelbedsSeeds).toHaveBeenCalled();
    expect(response.hotels.hotels[0].exclusiveDeal).toBe(2);
  });

  it("maps known destination names and applies child occupancy factors", async () => {
    const dubai = await buildHotelBedsAvailabilityResponse({
      ...baseParams,
      destinationCode: "DXB",
      destination: "Dubai",
      occupancies: [{ rooms: 1, adults: 2, children: 2 }],
    });

    expect(dubai.hotels.hotels[0].destinationName).toBe("Dubai");
    expect(dubai.hotels.hotels[0].rooms[0].rates[0].children).toBe(2);
  });

  it("adds a bookable follow-up rate for RECHECK seeds", async () => {
    const response = await buildHotelBedsAvailabilityResponse(baseParams);
    const recheckHotel = response.hotels.hotels.find((hotel) =>
      hotel.rooms[0].rates.some((rate) => rate.rateType === "RECHECK"),
    );

    expect(recheckHotel).toBeDefined();
    expect(recheckHotel?.rooms[0].rates.length).toBeGreaterThan(1);
    expect(
      recheckHotel?.rooms[0].rates.some((rate) => rate.rateType === "BOOKABLE"),
    ).toBe(true);
  });
});
