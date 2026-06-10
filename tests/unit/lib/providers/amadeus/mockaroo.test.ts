import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMockarooAmadeusSeeds } from "@/lib/providers/amadeus/mockaroo";

describe("fetchMockarooAmadeusSeeds", () => {
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

    await expect(fetchMockarooAmadeusSeeds(3)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches Amadeus offer seeds from Mockaroo", async () => {
    vi.stubEnv("MOCKAROO_API_KEY", "mock-key");
    const seeds = [
      {
        carrier: "BA",
        flightNumber: 117,
        baseFarePerPax: 350,
        taxPerPax: 70,
        outboundElapsed: 300,
        returnElapsed: 310,
        stops: 0,
        equipment: "359",
        bookableSeats: 9,
      },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => seeds,
    });

    const result = await fetchMockarooAmadeusSeeds(1);

    expect(result).toEqual(seeds);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.mockaroo.com");
  });

  it("throws when Mockaroo responds with an error", async () => {
    vi.stubEnv("MOCKAROO_API_KEY", "mock-key");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "server error",
    });

    await expect(fetchMockarooAmadeusSeeds(2)).rejects.toThrow(
      "Mockaroo Amadeus seed fetch failed (500): server error",
    );
  });
});
