import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/geo/airports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/geo/airports")>();
  return {
    ...actual,
    resolveAirportCode: (city: string) => (city.toLowerCase().includes("mystery") ? "ZZZ" : null),
    getAirportByCode: () => undefined,
  };
});

describe("parseTripQuery airport metadata fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the raw city label when airport metadata is unavailable", async () => {
    vi.stubEnv("MOCK_LLM", "true");
    const { parseTripQuery } = await import("@/lib/llm/parse-trip-query");

    const result = await parseTripQuery(
      "family of 2 from Dubai to Mysteryville, December 20-27",
    );

    expect(result.flights.destination).toBe("ZZZ");
    expect(result.hotels.destination).toBe("Mysteryville");
  });
});
