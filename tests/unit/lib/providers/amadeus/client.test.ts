import { afterEach, describe, expect, it, vi } from "vitest";
import { searchAmadeusFlights } from "@/lib/providers/amadeus/client";

const flightParams = {
  origin: "DXB",
  destination: "LON",
  departureDate: "2026-12-20",
  returnDate: "2026-12-27",
  passengers: { adults: 2, children: 0, infants: 0 },
  cabin: "ECONOMY" as const,
};

describe("searchAmadeusFlights", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns mock flight offers when mocking is enabled", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    const result = await searchAmadeusFlights(flightParams);

    expect(result).toMatchObject({
      meta: { count: expect.any(Number) },
      data: expect.any(Array),
    });
  });

  it("throws validation error for ERR origin", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    await expect(
      searchAmadeusFlights({ ...flightParams, origin: "ERR" }),
    ).rejects.toThrow("Amadeus validation error");
  });

  it("throws unavailable error for ZZZ origin in mock mode", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    await expect(
      searchAmadeusFlights({ ...flightParams, origin: "ZZZ", destination: "LON" }),
    ).rejects.toThrow("Amadeus unavailable");
  });

  it("rejects live integration when mocking is disabled", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("MOCK_AMADEUS", "false");

    await expect(searchAmadeusFlights(flightParams)).rejects.toThrow(
      "Amadeus live integration unavailable",
    );
  });
});
