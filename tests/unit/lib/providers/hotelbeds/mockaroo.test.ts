import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMockarooHotelbedsSeeds } from "@/lib/providers/hotelbeds/mockaroo";

describe("fetchMockarooHotelbedsSeeds", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns null when MOCKAROO_API_KEY is missing", async () => {
    vi.stubEnv("MOCKAROO_API_KEY", "");

    await expect(fetchMockarooHotelbedsSeeds(3)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches HotelBeds rate seeds from Mockaroo", async () => {
    vi.stubEnv("MOCKAROO_API_KEY", "mock-key");
    const seeds = [
      {
        nightlyNet: 120,
        taxPerNight: 14,
        allotment: 8,
        exclusiveDeal: 1,
        boardCode: "BB" as const,
        rateType: "BOOKABLE" as const,
        zoneCode: 60,
      },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => seeds,
    });

    const result = await fetchMockarooHotelbedsSeeds(1);

    expect(result).toEqual(seeds);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.mockaroo.com");
  });

  it("throws when Mockaroo responds with an error", async () => {
    vi.stubEnv("MOCKAROO_API_KEY", "mock-key");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "forbidden",
    });

    await expect(fetchMockarooHotelbedsSeeds(2)).rejects.toThrow(
      "Mockaroo HotelBeds seed fetch failed (403): forbidden",
    );
  });
});
