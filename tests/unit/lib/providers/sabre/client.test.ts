import { afterEach, describe, expect, it, vi } from "vitest";
import { searchSabreFlights } from "@/lib/providers/sabre/client";

const flightParams = {
  origin: "DXB",
  destination: "LON",
  departureDate: "2026-12-20",
  returnDate: "2026-12-27",
  passengers: { adults: 2, children: 0, infants: 0 },
  cabin: "ECONOMY" as const,
};

describe("searchSabreFlights", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns mock Sabre OTA response when mocking is enabled", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    const result = await searchSabreFlights(flightParams);

    expect(result).toMatchObject({
      OTA_AirLowFareSearchRS: expect.objectContaining({
        PricedItinCount: expect.any(Number),
      }),
    });
  });

  it("throws validation error for ERR origin", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    await expect(
      searchSabreFlights({ ...flightParams, origin: "ERR" }),
    ).rejects.toThrow("Sabre validation error");
  });

  it("throws unavailable error for ZZZ origin in mock mode", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    await expect(
      searchSabreFlights({ ...flightParams, origin: "ZZZ", destination: "LON" }),
    ).rejects.toThrow("Sabre unavailable");
  });

  it("calls live Sabre search when mocking is disabled", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("MOCK_SABRE", "false");

    const liveSearch = await import("@/lib/providers/sabre/live-search");
    const liveSpy = vi
      .spyOn(liveSearch, "searchSabreFlightsLive")
      .mockResolvedValue({ OTA_AirLowFareSearchRS: { PricedItinCount: 0 } });

    const result = await searchSabreFlights(flightParams);

    expect(liveSpy).toHaveBeenCalledWith(flightParams);
    expect(result).toEqual({ OTA_AirLowFareSearchRS: { PricedItinCount: 0 } });
    liveSpy.mockRestore();
  });
});
