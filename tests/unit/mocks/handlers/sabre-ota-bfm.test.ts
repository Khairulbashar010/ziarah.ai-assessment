import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSabreOtaResponse } from "@/mocks/handlers/sabre-ota-bfm";
import * as sabreMockaroo from "@/lib/providers/sabre/mockaroo";
import * as routeSeed from "@/mocks/seed/route-seed";

describe("buildSabreOtaResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns Sabre OTA_AirLowFareSearchRS envelope for seeded routes", async () => {
    const response = await buildSabreOtaResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      passengers: { adults: 2, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    const ota = response.OTA_AirLowFareSearchRS;
    expect(ota.Version).toBe("3.3.0");
    expect(ota.PricedItinCount).toBeGreaterThan(0);
    expect(ota.PricedItineraries.PricedItinerary).toHaveLength(ota.PricedItinCount);
    expect(ota.PricedItineraries.PricedItinerary[0].AirItinerary.DirectionInd).toBe("Return");
    expect(response.Links).toHaveLength(2);
  });

  it("returns empty priced itineraries for unknown routes", async () => {
    const response = await buildSabreOtaResponse({
      origin: "ZZZ",
      destination: "YYY",
      departureDate: "2026-12-20",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    expect(response.OTA_AirLowFareSearchRS.PricedItinCount).toBe(0);
    expect(response.OTA_AirLowFareSearchRS.PricedItineraries.PricedItinerary).toEqual([]);
  });

  it("builds one-way itineraries without return legs", async () => {
    const response = await buildSabreOtaResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    const itinerary = response.OTA_AirLowFareSearchRS.PricedItineraries.PricedItinerary[0];
    expect(itinerary.AirItinerary.DirectionInd).toBe("OneWay");
    expect(itinerary.AirItinerary.OriginDestinationOptions.OriginDestinationOption).toHaveLength(
      1,
    );
  });

  it("builds connecting outbound and return segments for long-haul routes", async () => {
    const response = await buildSabreOtaResponse({
      origin: "SYD",
      destination: "LHR",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      passengers: { adults: 2, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    const stoppedItinerary = response.OTA_AirLowFareSearchRS.PricedItineraries.PricedItinerary.find(
      (itinerary) =>
        itinerary.AirItinerary.OriginDestinationOptions.OriginDestinationOption.some((leg) =>
          leg.FlightSegment.some((segment) => segment.DepartureAirport.LocationCode === "ORD"),
        ),
    );

    expect(stoppedItinerary).toBeDefined();
    const legs = stoppedItinerary!.AirItinerary.OriginDestinationOptions.OriginDestinationOption;
    expect(legs).toHaveLength(2);
    expect(legs[1].FlightSegment.some((segment) => segment.DepartureAirport.LocationCode === "MCO"))
      .toBe(true);
  });

  it("includes infants in Sabre passenger counts", async () => {
    const response = await buildSabreOtaResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      passengers: { adults: 1, children: 1, infants: 1 },
      cabin: "ECONOMY",
    });

    const breakdown =
      response.OTA_AirLowFareSearchRS.PricedItineraries.PricedItinerary[0]
        .AirItineraryPricingInfo[0].PTC_FareBreakdowns.PTC_FareBreakdown[0].PassengerTypeQuantity;
    expect(breakdown.Quantity).toBe(3);
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

    const response = await buildSabreOtaResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    const segment =
      response.OTA_AirLowFareSearchRS.PricedItineraries.PricedItinerary[0].AirItinerary
        .OriginDestinationOptions.OriginDestinationOption[0].FlightSegment[0];
    expect(segment.DepartureDateTime).toBe("2026-12-20T06:15:00");
  });

  it("uses Mockaroo seeds when an API key is configured", async () => {
    vi.spyOn(sabreMockaroo, "fetchMockarooSabreSeeds").mockResolvedValue([
      {
        carrier: "EK",
        flightNumber: 301,
        baseFarePerPax: 450,
        taxPerPax: 90,
        outboundElapsed: 400,
        returnElapsed: 410,
        stops: 0,
        equipment: "77W",
      },
    ]);

    const response = await buildSabreOtaResponse({
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      passengers: { adults: 2, children: 0, infants: 0 },
      cabin: "ECONOMY",
    });

    expect(sabreMockaroo.fetchMockarooSabreSeeds).toHaveBeenCalled();
    expect(response.OTA_AirLowFareSearchRS.PricedItinCount).toBeGreaterThan(0);
  });
});
