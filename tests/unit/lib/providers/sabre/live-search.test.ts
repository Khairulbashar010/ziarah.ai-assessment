import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchSabreFlightsLive } from "@/lib/providers/sabre/live-search";

vi.mock("@/lib/providers/sabre/auth", () => ({
  getSabreAccessToken: vi.fn().mockResolvedValue("bearer-token"),
  getSabrePcc: vi.fn().mockReturnValue("ABCD"),
}));

const flightParams = {
  origin: "DXB",
  destination: "LON",
  departureDate: "2026-12-20",
  returnDate: "2026-12-27",
  passengers: { adults: 2, children: 0, infants: 0 },
  cabin: "ECONOMY" as const,
};

describe("searchSabreFlightsLive", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.SABRE_ENV;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("posts a BFM request to the test Sabre shop endpoint", async () => {
    const payload = { OTA_AirLowFareSearchRS: { PricedItinCount: 2 } };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => payload,
    });

    const result = await searchSabreFlightsLive(flightParams);

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.test.sabre.com/v4.3.0/shop/flights?mode=live",
    );
    expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBe("Bearer bearer-token");
  });

  it("uses the production Sabre host when SABRE_ENV is prod", async () => {
    process.env.SABRE_ENV = "prod";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await searchSabreFlightsLive(flightParams);

    expect(String(fetchMock.mock.calls[0][0])).toContain("https://api.sabre.com/");
  });

  it("throws with Sabre error message when BFM fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: "Invalid itinerary" }),
    });

    await expect(searchSabreFlightsLive(flightParams)).rejects.toThrow(
      "Sabre BFM failed (400): Invalid itinerary",
    );
  });

  it("stringifies non-message error payloads", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ code: "SERVER_ERROR" }),
    });

    await expect(searchSabreFlightsLive(flightParams)).rejects.toThrow(
      'Sabre BFM failed (500): {"code":"SERVER_ERROR"}',
    );
  });
});
