import { describe, it, expect } from "vitest";
import { normalizeSabreFlights } from "@/lib/normalization/sabre";
import { buildSabreOtaResponse } from "@/mocks/handlers/sabre-ota-bfm";

const flightParams = {
  origin: "DXB",
  destination: "LON",
  departureDate: "2026-12-20",
  returnDate: "2026-12-27",
  passengers: { adults: 2, children: 2, infants: 0 },
  cabin: "ECONOMY" as const,
};

describe("normalizeSabreFlights OTA_AirLowFareSearchRS", () => {
  it("normalizes Mockaroo-style Sabre OTA mock into unified flight offers", async () => {
    const raw = await buildSabreOtaResponse(flightParams);
    const offers = normalizeSabreFlights(raw);

    expect(raw).toHaveProperty("OTA_AirLowFareSearchRS");
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].provider).toBe("sabre");
    expect(offers[0].id).toBe("sabre-mock-offer-001");
    expect(offers[0].totalPrice).toBeGreaterThan(0);
    expect(offers[0].segments[0].origin).toBe("DXB");
    expect(offers[0].segments.at(-1)?.destination).toBe("DXB");
  });
});
