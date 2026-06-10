import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAmadeusFlightOffersResponse } from "@/mocks/handlers/amadeus-flights";
import * as amadeusMockaroo from "@/lib/providers/amadeus/mockaroo";
import * as routeSeed from "@/mocks/seed/route-seed";

describe("buildAmadeusFlightOffersResponse edge cases", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty data for unknown routes", async () => {
    const response = await buildAmadeusFlightOffersResponse({
      origin: "ZZZ",
      destination: "YYY",
      departureDate: "2026-12-20",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    expect(response.meta.count).toBe(0);
    expect(response.data).toEqual([]);
  });

  it("includes child traveler pricings when children are present", async () => {
    const response = await buildAmadeusFlightOffersResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      passengers: { adults: 2, children: 2, infants: 0 },
      cabin: "ECONOMY",
    });

    const travelerTypes = response.data[0].travelerPricings.map((pricing) => pricing.travelerType);
    expect(travelerTypes).toContain("CHILD");
    expect(travelerTypes.filter((type) => type === "CHILD")).toHaveLength(2);
  });

  it("omits returnDate from self link for one-way searches", async () => {
    const response = await buildAmadeusFlightOffersResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    expect(response.meta.links?.self).not.toContain("returnDate=");
    expect(response.data[0].oneWay).toBe(true);
  });

  it("builds connecting segments when route seeds include stops", async () => {
    const response = await buildAmadeusFlightOffersResponse({
      origin: "SYD",
      destination: "LHR",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      passengers: { adults: 2, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    const stoppedOffer = response.data.find((offer) =>
      offer.itineraries[0].segments.some((segment) => segment.departure.iataCode === "DOH"),
    );

    expect(stoppedOffer).toBeDefined();
    expect(stoppedOffer?.itineraries[0].segments.length).toBeGreaterThan(1);
  });

  it("preserves departure times that already include seconds", async () => {
    vi.spyOn(routeSeed, "resolveRouteSeed").mockReturnValue({
      origin: "DXB",
      destination: "LON",
      priceMin: 200,
      priceMax: 400,
      durationMinutes: 420,
      offers: [
        {
          carrier: "EK",
          flightNumber: "100",
          origin: "DXB",
          destination: "LON",
          departure: "06:15:00",
          arrival: "14:30:00",
          stops: 0,
          priceMultiplier: 1,
        },
      ],
    });

    const response = await buildAmadeusFlightOffersResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    expect(response.data[0].itineraries[0].segments[0].departure.at).toBe(
      "2026-12-20T06:15:00",
    );
  });

  it("uses Mockaroo seeds when an API key is configured", async () => {
    vi.spyOn(amadeusMockaroo, "fetchMockarooAmadeusSeeds").mockResolvedValue([
      {
        carrier: "EK",
        flightNumber: 201,
        baseFarePerPax: 500,
        taxPerPax: 100,
        outboundElapsed: 360,
        returnElapsed: 370,
        stops: 0,
        equipment: "77W",
        bookableSeats: 5,
      },
    ]);

    const response = await buildAmadeusFlightOffersResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    expect(amadeusMockaroo.fetchMockarooAmadeusSeeds).toHaveBeenCalled();
    expect(response.data[0].numberOfBookableSeats).toBe(5);
  });

  it("ignores segment durations that do not match the ISO pattern", async () => {
    const originalMatch = String.prototype.match;
    vi.spyOn(String.prototype, "match").mockImplementation(function (
      this: string,
      regex: RegExp,
    ) {
      if (regex.source.includes("PT")) {
        return null;
      }
      return originalMatch.call(this, regex);
    });

    const response = await buildAmadeusFlightOffersResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    expect(response.data[0].itineraries[0].duration).toBe("PT0H0M");
  });

  it("sums minute-only ISO durations when hours are omitted", async () => {
    const originalMatch = String.prototype.match;
    vi.spyOn(String.prototype, "match").mockImplementation(function (
      this: string,
      regex: RegExp,
    ) {
      if (regex.source.includes("PT")) {
        return ["PT45M", undefined, "45"] as RegExpMatchArray;
      }
      return originalMatch.call(this, regex);
    });

    const response = await buildAmadeusFlightOffersResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    expect(response.data[0].itineraries[0].duration).toBe("PT0H45M");
  });

  it("sums hour-only ISO durations when minutes are omitted", async () => {
    const originalMatch = String.prototype.match;
    vi.spyOn(String.prototype, "match").mockImplementation(function (
      this: string,
      regex: RegExp,
    ) {
      if (regex.source.includes("PT")) {
        return ["PT3H", "3", undefined] as RegExpMatchArray;
      }
      return originalMatch.call(this, regex);
    });

    const response = await buildAmadeusFlightOffersResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    expect(response.data[0].itineraries[0].duration).toBe("PT3H0M");
  });

  it("includes infants in traveler pricing counts", async () => {
    const response = await buildAmadeusFlightOffersResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      passengers: { adults: 1, children: 0, infants: 1 },
      cabin: "ECONOMY",
    });

    expect(response.data[0].travelerPricings).toHaveLength(1);
    expect(response.data[0].price.total).toBeTruthy();
  });
});
