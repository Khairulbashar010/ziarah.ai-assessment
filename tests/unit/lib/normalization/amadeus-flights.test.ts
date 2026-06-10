import { describe, it, expect } from "vitest";
import { normalizeAmadeusFlights } from "@/lib/normalization/amadeus";
import { buildAmadeusFlightOffersResponse } from "@/mocks/handlers/amadeus-flights";

const roundTripParams = {
  origin: "DXB",
  destination: "LON",
  departureDate: "2026-12-20",
  returnDate: "2026-12-27",
  passengers: { adults: 2, children: 2, infants: 0 },
  cabin: "ECONOMY" as const,
};

const oneWayParams = {
  ...roundTripParams,
  returnDate: undefined,
};

describe("buildAmadeusFlightOffersResponse", () => {
  it("returns provider-native roundtrip flight-offer shape with two itineraries", async () => {
    const raw = await buildAmadeusFlightOffersResponse(roundTripParams);
    const offer = raw.data[0];

    expect(raw.meta.count).toBeGreaterThan(0);
    expect(offer.oneWay).toBe(false);
    expect(offer.itineraries).toHaveLength(2);
    expect(offer.itineraries[0].segments[0].departure.iataCode).toBe("DXB");
    expect(offer.itineraries[1].segments.at(-1)?.arrival.iataCode).toBe("DXB");
    expect(offer.price.grandTotal).toBeTruthy();
    expect(offer.travelerPricings[0].fareDetailsBySegment.length).toBeGreaterThan(1);
    expect(raw.dictionaries).toBeDefined();
  });

  it("returns one-way offers with a single itinerary", async () => {
    const raw = await buildAmadeusFlightOffersResponse(oneWayParams);
    const offer = raw.data[0];

    expect(offer.oneWay).toBe(true);
    expect(offer.itineraries).toHaveLength(1);
  });

  it("normalizes Mockaroo-style Amadeus mock into unified flight offers", async () => {
    const raw = await buildAmadeusFlightOffersResponse(roundTripParams);
    const offers = normalizeAmadeusFlights(raw);

    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].provider).toBe("amadeus");
    expect(offers[0].totalPrice).toBeGreaterThan(0);
    expect(offers[0].segments[0].origin).toBe("DXB");
    expect(offers[0].segments.at(-1)?.destination).toBe("DXB");
  });
});
