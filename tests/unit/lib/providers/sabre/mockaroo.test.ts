import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMockarooSabreSeeds } from "@/lib/providers/sabre/mockaroo";

describe("fetchMockarooSabreSeeds", () => {
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

    await expect(fetchMockarooSabreSeeds(3)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches Sabre itinerary seeds from Mockaroo", async () => {
    vi.stubEnv("MOCKAROO_API_KEY", "mock-key");
    const seeds = [
      {
        carrier: "EK",
        flightNumber: 1,
        baseFarePerPax: 400,
        taxPerPax: 80,
        outboundElapsed: 420,
        returnElapsed: 430,
        stops: 0,
        equipment: "77W",
      },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => seeds,
    });

    const result = await fetchMockarooSabreSeeds(1);

    expect(result).toEqual(seeds);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api.mockaroo.com");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("throws when Mockaroo responds with an error", async () => {
    vi.stubEnv("MOCKAROO_API_KEY", "mock-key");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    await expect(fetchMockarooSabreSeeds(2)).rejects.toThrow(
      "Mockaroo Sabre seed fetch failed (429): rate limited",
    );
  });
});
