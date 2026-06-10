import { afterEach, describe, expect, it, vi } from "vitest";
import { searchHotelBedsHotels } from "@/lib/providers/hotelbeds/client";

const hotelParams = {
  destination: "London",
  destinationCode: "LON",
  checkIn: "2026-12-20",
  checkOut: "2026-12-27",
  occupancies: [{ rooms: 1, adults: 2, children: 0 }],
};

describe("searchHotelBedsHotels", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns mock HotelBeds availability when mocking is enabled", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    const result = await searchHotelBedsHotels(hotelParams);

    expect(result).toMatchObject({
      hotels: expect.objectContaining({
        total: expect.any(Number),
        hotels: expect.any(Array),
      }),
    });
  });

  it("throws validation error for ERR destination", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    await expect(
      searchHotelBedsHotels({ ...hotelParams, destinationCode: "ERR" }),
    ).rejects.toThrow("HotelBeds validation error");
  });

  it("throws unavailable error for FAIL destination in mock mode", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    await expect(
      searchHotelBedsHotels({ ...hotelParams, destinationCode: "FAIL" }),
    ).rejects.toThrow("HotelBeds unavailable");
  });

  it("calls live HotelBeds search when mocking is disabled", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("MOCK_HOTELBEDS", "false");

    const liveSearch = await import("@/lib/providers/hotelbeds/live-search");
    const liveSpy = vi
      .spyOn(liveSearch, "searchHotelBedsHotelsLive")
      .mockResolvedValue({ hotels: { total: 0, hotels: [] } });

    const result = await searchHotelBedsHotels(hotelParams);

    expect(liveSpy).toHaveBeenCalledWith(hotelParams);
    expect(result).toEqual({ hotels: { total: 0, hotels: [] } });
    liveSpy.mockRestore();
  });
});
