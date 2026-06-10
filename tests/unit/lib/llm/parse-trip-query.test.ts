import { afterEach, describe, expect, it, vi } from "vitest";
import { formatParsedSummary, parseTripQuery, streamParseTripQuery } from "@/lib/llm/parse-trip-query";
import type { TripSearchStreamEvent } from "@/lib/trip-search/stream-events";

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

  it("falls back to fast parse when sync LLM timeout is exceeded", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }
          signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
      ),
    );

    const result = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
      null,
      { llmTimeoutMs: 25, mode: "sync" },
    );

    expect(result.flights.origin).toBe("DXB");
    expect(result.hotels.destinationCode).toBe("LON");

    vi.unstubAllGlobals();
  });

  it("prefers the fast parser on sync search when regex matches", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
      null,
      { mode: "sync" },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.flights.origin).toBe("DXB");
    expect(result.hotels.destinationCode).toBe("LON");

    vi.unstubAllGlobals();
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

async function collectParseStream(
  query: string,
  context?: Parameters<typeof streamParseTripQuery>[1],
): Promise<TripSearchStreamEvent[]> {
  const events: TripSearchStreamEvent[] = [];
  for await (const event of streamParseTripQuery(query, context)) {
    events.push(event);
  }
  return events;
}

describe("streamParseTripQuery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("yields modify status when refining an existing trip", async () => {
    vi.stubEnv("MOCK_LLM", "true");
    const base = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    const events = await collectParseStream("increase budget to $8000", base);

    expect(events[0]).toMatchObject({
      type: "status",
      message: "Updating your trip details...",
      progress: 10,
    });
    expect(events.at(-1)).toMatchObject({ type: "parsed" });
  });

  it("yields new_search status when context exists but route changes", async () => {
    vi.stubEnv("MOCK_LLM", "true");
    const base = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    const stream = streamParseTripQuery("from Dubai to Paris instead", base);
    const first = await stream.next();

    expect(first.value).toMatchObject({
      type: "status",
      message: "Planning a new trip...",
    });
  });

  it("yields understanding status without context", async () => {
    vi.stubEnv("MOCK_LLM", "true");

    const events = await collectParseStream(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(events[0]).toMatchObject({
      type: "status",
      message: "Understanding your trip...",
    });
    expect(events.some((e) => e.type === "parsed")).toBe(true);
  });

  it("uses the LLM path when OPENAI_API_KEY is set", async () => {
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
      preferences: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(llmResult) } }],
        }),
      }),
    );

    const events = await collectParseStream("trip to Rome");

    expect(events.some((e) => e.type === "status" && e.message.includes("Extracting"))).toBe(true);
    const parsed = events.find((e) => e.type === "parsed");
    expect(parsed?.type).toBe("parsed");
    if (parsed?.type === "parsed") {
      expect(parsed.params.flights.origin).toBe("PAR");
    }
  });

  it("falls back to fast parse when the LLM call fails", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const events = await collectParseStream(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(events.at(-1)?.type).toBe("parsed");
  });

  it("throws when parsing fails", async () => {
    vi.stubEnv("MOCK_LLM", "true");
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(collectParseStream("surprise me with a trip")).rejects.toThrow(/parse/i);
  });

  it("re-parses a new route instead of modifying context", async () => {
    vi.stubEnv("MOCK_LLM", "true");
    const base = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    const result = await parseTripQuery("from Dubai to Paris, December 20-27", base);

    expect(result.flights.destination).toBe("PAR");
    expect(result.hotels.destinationCode).toBe("PAR");
  });

  it("resolves airport-only cities outside the metro list", async () => {
    vi.stubEnv("MOCK_LLM", "true");

    const result = await parseTripQuery(
      "family of 2 from Dubai to Frankfurt, December 20-27",
    );

    expect(result.flights.destination).toBe("FRA");
    expect(result.hotels.destination).toBeTruthy();
  });

  it("parses budget shorthand like 3k in the initial query", async () => {
    vi.stubEnv("MOCK_LLM", "true");

    const result = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget 3k",
    );

    expect(result.budget?.maxTotal).toBe(3000);
  });

  it("fails when mock parser cannot resolve either city", async () => {
    vi.stubEnv("MOCK_LLM", "true");

    await expect(
      parseTripQuery("family of 2 from Nowhereville to Unknowntown, December 20-27"),
    ).rejects.toThrow(/parse/i);
  });

  it("assigns child ages when the mock parser infers children", async () => {
    vi.stubEnv("MOCK_LLM", "true");

    const result = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    expect(result.hotels.occupancies[0].childAges).toEqual([8, 9]);
  });

});

describe("formatParsedSummary", () => {
  it("formats travelers, route, and nights", async () => {
    vi.stubEnv("MOCK_LLM", "true");
    const params = await parseTripQuery(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
    );

    const summary = formatParsedSummary(params);
    expect(summary).toContain("DXB");
    expect(summary).toContain("London");
    expect(summary).toContain("2 adults");
    expect(summary).toContain("2 children");
    expect(summary).toContain("7 nights");
  });

  it("uses singular child label for one child", async () => {
    vi.stubEnv("MOCK_LLM", "true");
    const params = await parseTripQuery(
      "family of 3 from Dubai to London, December 20-27, budget $3000",
    );

    const summary = formatParsedSummary(params);
    expect(summary).toContain("1 child");
    expect(summary).not.toContain("1 children");
  });
});

describe("parseTripQuery error messages", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("mentions missing OPENAI_API_KEY when LLM is disabled", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(parseTripQuery("surprise me with a trip")).rejects.toThrow(
      /OPENAI_API_KEY is not set/,
    );
  });

  it("uses generic parse failure when LLM is enabled but returns nothing", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(parseTripQuery("surprise me with a trip")).rejects.toThrow(
      /Could not parse query$/,
    );
  });

  it("sync search tries the LLM after fast parse misses and surfaces generic failure", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(
      parseTripQuery("surprise me with a trip", null, { mode: "sync", llmTimeoutMs: 50 }),
    ).rejects.toThrow(/Could not parse query$/);
  });

  it("streamParseTripQuery mentions missing OPENAI_API_KEY when LLM is disabled", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(collectParseStream("surprise me with a trip")).rejects.toThrow(
      /OPENAI_API_KEY is not set/,
    );
  });

  it("streamParseTripQuery uses generic parse failure when LLM is enabled but fails", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(collectParseStream("surprise me with a trip")).rejects.toThrow(
      /Could not parse query$/,
    );
  });
});
