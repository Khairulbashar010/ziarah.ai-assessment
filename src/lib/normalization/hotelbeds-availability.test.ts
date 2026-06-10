import { describe, it, expect } from "vitest";
import { normalizeHotelBedsHotels } from "./hotelbeds";
import { buildHotelBedsAvailabilityResponse } from "@/mocks/handlers/hotelbeds-availability";

const hotelParams = {
  destination: "London",
  destinationCode: "LON",
  checkIn: "2026-12-20",
  checkOut: "2026-12-27",
  occupancies: [{ rooms: 1, adults: 2, children: 2 }],
};

describe("buildHotelBedsAvailabilityResponse", () => {
  it("returns provider-native HotelBeds availability envelope", async () => {
    const raw = await buildHotelBedsAvailabilityResponse(hotelParams);

    expect(raw.auditData.environment).toBe("TEST");
    expect(raw.hotels.total).toBeGreaterThan(0);
    expect(raw.hotels.hotels[0].destinationCode).toBe("LON");
    expect(raw.hotels.hotels[0].latitude).toBeTruthy();
    expect(raw.hotels.hotels[0].rooms[0].rates[0].rateKey).toContain("8812");
    expect(raw.hotels.hotels[0].rooms[0].rates[0].taxes).toBeDefined();
  });

  it("includes RECHECK and BOOKABLE rates when seeded as RECHECK", async () => {
    const raw = await buildHotelBedsAvailabilityResponse(hotelParams);
    const firstHotelRates = raw.hotels.hotels[0].rooms[0].rates;
    const rateTypes = firstHotelRates.map((rate) => rate.rateType);

    expect(rateTypes).toContain("RECHECK");
    expect(rateTypes).toContain("BOOKABLE");
  });

  it("normalizes Mockaroo-style HotelBeds mock into unified hotel offers", async () => {
    const raw = await buildHotelBedsAvailabilityResponse(hotelParams);
    const offers = normalizeHotelBedsHotels(raw, hotelParams.checkIn, hotelParams.checkOut);

    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].provider).toBe("hotelbeds");
    expect(offers[0].hotelName).toBe("London City Inn");
    expect(offers[0].nights).toBe(7);
    expect(offers[0].totalPrice).toBeGreaterThan(0);
  });

  it("returns empty hotels for unknown destinations", async () => {
    const raw = await buildHotelBedsAvailabilityResponse({
      ...hotelParams,
      destinationCode: "ZZZ",
    });

    expect(raw.hotels.total).toBe(0);
    expect(raw.hotels.hotels).toEqual([]);
  });
});
