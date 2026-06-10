import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTripQuery } from "./parse-trip-query";

describe("parseTripQuery mock path", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses assessment example with MOCK_LLM=true", async () => {
    vi.stubEnv("MOCK_LLM", "true");

    const result = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(result.flights.origin).toBe("DXB");
    expect(result.hotels.destinationCode).toBe("LON");
    expect(result.budget?.maxTotal).toBe(3000);
    expect(result.flights.passengers).toEqual({ adults: 2, children: 2, infants: 0 });
  });

  it("returns null-shaped failure for unsupported mock phrasing without OpenAI", async () => {
    vi.stubEnv("MOCK_LLM", "true");
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(parseTripQuery("surprise me with a trip")).rejects.toThrow(/parse/i);
  });

  it("applies follow-up budget changes against existing trip context", async () => {
    vi.stubEnv("MOCK_LLM", "true");

    const base = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );
    const updated = await parseTripQuery("increase budget to $8000", base);

    expect(updated.budget?.maxTotal).toBe(8000);
    expect(updated.flights.origin).toBe("DXB");
    expect(updated.hotels.destinationCode).toBe("LON");
  });

  it("parses budget slang like 3k in follow-up messages", async () => {
    vi.stubEnv("MOCK_LLM", "true");

    const base = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );
    const updated = await parseTripQuery("Make budget to 3k", base);

    expect(updated.budget?.maxTotal).toBe(3000);
    expect(updated.flights.origin).toBe("DXB");
  });

  it("falls back to the fast parser when LLM is unavailable", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "");

    const result = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(result.flights.origin).toBe("DXB");
    expect(result.hotels.destinationCode).toBe("LON");
  });

  it("prefers the LLM path when OPENAI_API_KEY is set", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const llmResult = {
      flights: {
        origin: "PAR",
        destination: "ROM",
        departureDate: "2026-06-01",
        returnDate: "2026-06-08",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
      },
      hotels: {
        destination: "Rome",
        destinationCode: "ROM",
        checkIn: "2026-06-01",
        checkOut: "2026-06-08",
        occupancies: [{ rooms: 1, adults: 2, children: 0, childAges: null }],
      },
      budget: null,
      tripType: "ROUND_TRIP",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(llmResult) } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.flights.origin).toBe("PAR");
    expect(result.hotels.destinationCode).toBe("ROM");

    vi.unstubAllGlobals();
  });
});
