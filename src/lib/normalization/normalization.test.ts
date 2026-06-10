import { describe, it, expect } from "vitest";
import { normalizeSabreFlights } from "./sabre";
import { normalizeAmadeusFlights } from "./amadeus";
import { normalizeHotelBedsHotels } from "./hotelbeds";
import { buildSabreOtaResponse } from "@/mocks/handlers/sabre-ota-bfm";
import { buildAmadeusFlightOffersResponse } from "@/mocks/handlers/amadeus-flights";
import { buildHotelBedsAvailabilityResponse } from "@/mocks/handlers/hotelbeds-availability";

const flightParams = {
  origin: "DXB",
  destination: "LON",
  departureDate: "2026-12-20",
  returnDate: "2026-12-27",
  passengers: { adults: 2, children: 2, infants: 0 },
  cabin: "ECONOMY" as const,
};

const hotelParams = {
  destination: "London",
  destinationCode: "LON",
  checkIn: "2026-12-20",
  checkOut: "2026-12-27",
  occupancies: [{ rooms: 1, adults: 2, children: 2 }],
};

describe("normalization", () => {
  it("normalizes Sabre OTA into unified flight offers", async () => {
    const raw = await buildSabreOtaResponse(flightParams);
    const offers = normalizeSabreFlights(raw);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].provider).toBe("sabre");
    expect(offers[0].totalPrice).toBeGreaterThan(0);
    expect(offers[0].segments[0].origin).toBe("DXB");
  });

  it("normalizes Amadeus flight offers", async () => {
    const raw = await buildAmadeusFlightOffersResponse(flightParams);
    const offers = normalizeAmadeusFlights(raw);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].provider).toBe("amadeus");
    expect(offers[0].segments.length).toBeGreaterThan(0);
  });

  it("normalizes HotelBeds availability into unified hotel offers", async () => {
    const raw = await buildHotelBedsAvailabilityResponse(hotelParams);
    const offers = normalizeHotelBedsHotels(raw, hotelParams.checkIn, hotelParams.checkOut);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].provider).toBe("hotelbeds");
    expect(offers[0].hotelName).toBe("London City Inn");
    expect(offers[0].nights).toBe(7);
  });
});
