import { describe, it, expect } from "vitest";
import { buildSabreBfmRequest } from "@/lib/providers/sabre/bfm-request";

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

  it("builds a one-way request without a return leg", () => {
    const request = buildSabreBfmRequest(
      {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        passengers: { adults: 1, children: 0, infants: 0 },
        cabin: "BUSINESS",
      },
      "ABCD",
    );

    expect(request.OTA_AirLowFareSearchRQ.OriginDestinationInformation).toHaveLength(1);
    expect(request.OTA_AirLowFareSearchRQ.DirectFlightsOnly).toBe(false);
    expect(request.OTA_AirLowFareSearchRQ.TravelPreferences.CabinPref[0].Cabin).toBe("C");
  });

  it("omits adult passenger type when adult count is zero", () => {
    const request = buildSabreBfmRequest(
      {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        passengers: { adults: 0, children: 2, infants: 0 },
        cabin: "ECONOMY",
      },
      "ABCD",
    );

    expect(request.OTA_AirLowFareSearchRQ.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity).toEqual([
      { Code: "CNN", Quantity: 2 },
    ]);
  });

  it("maps premium economy cabin to Sabre cabin code S", () => {
    const request = buildSabreBfmRequest(
      {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        passengers: { adults: 1, children: 0, infants: 0 },
        cabin: "PREMIUM_ECONOMY",
      },
      "ABCD",
    );

    expect(request.OTA_AirLowFareSearchRQ.TravelPreferences.CabinPref[0].Cabin).toBe("S");
  });

  it("includes infant passenger types when infants are present", () => {
    const request = buildSabreBfmRequest(
      {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        passengers: { adults: 1, children: 0, infants: 1 },
        cabin: "ECONOMY",
      },
      "ABCD",
    );

    expect(request.OTA_AirLowFareSearchRQ.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity).toEqual([
      { Code: "ADT", Quantity: 1 },
      { Code: "INF", Quantity: 1 },
    ]);
    expect(request.OTA_AirLowFareSearchRQ.TravelerInfoSummary.SeatsRequested).toEqual([2]);
  });
});
