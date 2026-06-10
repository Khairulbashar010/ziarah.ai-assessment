import { describe, it, expect } from "vitest";
import { buildSabreOtaResponse } from "./sabre-ota-bfm";

describe("buildSabreOtaResponse", () => {
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
});
