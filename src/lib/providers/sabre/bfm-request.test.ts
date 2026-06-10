import { describe, it, expect } from "vitest";
import { buildSabreBfmRequest } from "./bfm-request";

describe("buildSabreBfmRequest", () => {
  it("builds a round-trip BFM request with passenger mix", () => {
    const request = buildSabreBfmRequest(
      {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 2, infants: 0 },
        cabin: "ECONOMY",
      },
      "ABCD",
    );

    const body = request.OTA_AirLowFareSearchRQ;
    expect(body.POS.Source[0].PseudoCityCode).toBe("ABCD");
    expect(body.OriginDestinationInformation).toHaveLength(2);
    expect(body.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity).toEqual([
      { Code: "ADT", Quantity: 2 },
      { Code: "CNN", Quantity: 2 },
    ]);
  });

  it("requests direct flights when nonStop is set", () => {
    const request = buildSabreBfmRequest(
      {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
        nonStop: true,
      },
      "ABCD",
    );

    expect(request.OTA_AirLowFareSearchRQ.DirectFlightsOnly).toBe(true);
  });
});
