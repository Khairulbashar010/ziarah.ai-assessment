import { afterEach, describe, expect, it, vi } from "vitest";
import { TRIP_PARSE_SYSTEM_PROMPT } from "@/lib/llm/parse-instructions";
import {
  buildOpenAIChatRequestBody,
  buildOpenAITripSchema,
  DEFAULT_PROMPT_CACHE_KEY,
  normalizeOpenAIParsedParams,
  parseTripQueryWithOpenAI,
  resolvePromptCacheKey,
} from "@/lib/llm/openai-parse";
import { tripSearchParamsSchema } from "@/lib/llm/schemas";

describe("OpenAI trip parser", () => {
  it("exports a strict JSON schema without $schema for the API", () => {
    const schema = buildOpenAITripSchema();

    expect(schema).not.toHaveProperty("$schema");
    expect(schema).toHaveProperty("type", "object");
    expect(schema).toHaveProperty("additionalProperties", false);
    expect(schema).toHaveProperty("required", ["flights", "hotels", "budget", "tripType", "preferences"]);
    expect((schema as { properties: { flights: { required: string[] } } }).properties.flights.required).toContain(
      "returnDate",
    );
    expect((schema as { properties: { flights: { required: string[] } } }).properties.flights.required).toContain(
      "nonStop",
    );
  });

  it("normalizes nullable OpenAI fields before validation", () => {
    const parsed = normalizeOpenAIParsedParams({
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: null,
        passengers: { adults: 2, children: 2, infants: 0 },
        cabin: "ECONOMY",
        nonStop: null,
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 2, childAges: null }],
      },
      budget: null,
      tripType: "ONE_WAY",
      preferences: null,
    });

    expect(parsed.flights.returnDate).toBeUndefined();
    expect(parsed.budget).toBeUndefined();
    expect(parsed.hotels.occupancies[0].childAges).toBeUndefined();
  });

  it("validates the assessment example shape", () => {
    const example = {
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 2, infants: 0 },
        cabin: "ECONOMY",
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 2, childAges: [8, 10] }],
      },
      budget: { maxTotal: 3000, currency: "USD" },
      tripType: "ROUND_TRIP",
    };

    expect(tripSearchParamsSchema.parse(example)).toMatchObject(example);
  });

  it("instructs extraction-only parsing for provider fan-out", () => {
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("TripSearchParams");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("Do not invent offers");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("London=LON");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("ONE_WAY");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("ROUND_TRIP");
  });

  it("documents inference rules for dates, travelers, and budget", () => {
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("ALWAYS include");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("ONLY when explicitly stated");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("childAges");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("family of N");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("maxTotal");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("flights.returnDate");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain('"by $N"');
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("k/K=×1000");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("omit entirely unless");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("non-stop");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("minStars");
  });

  it("strips null preference sections and empty nested objects", () => {
    const parsed = normalizeOpenAIParsedParams({
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
        nonStop: null,
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 0, childAges: null }],
      },
      budget: null,
      tripType: "ROUND_TRIP",
      preferences: {
        flights: null,
        hotels: { sort: null, minStars: null, board: null },
      },
    });

    expect(parsed.preferences).toBeUndefined();
  });

  it("removes null keys inside partial preference objects", () => {
    const parsed = normalizeOpenAIParsedParams({
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
        nonStop: null,
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 0, childAges: null }],
      },
      budget: null,
      tripType: "ROUND_TRIP",
      preferences: {
        flights: { stops: null, sort: "price", refundableOnly: null, airlines: null },
        hotels: null,
      },
    });

    expect(parsed.preferences?.flights?.sort).toBe("price");
    expect(parsed.preferences?.flights?.stops).toBeUndefined();
    expect(parsed.preferences?.hotels).toBeUndefined();
  });

  it("drops an empty hotels preference object after stripping null keys", () => {
    const parsed = normalizeOpenAIParsedParams({
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
        nonStop: null,
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 0, childAges: null }],
      },
      budget: null,
      tripType: "ROUND_TRIP",
      preferences: {
        flights: null,
        hotels: { sort: null, minStars: null, board: null },
      },
    });

    expect(parsed.preferences).toBeUndefined();
  });

  it("drops an empty flights preference object after stripping null keys", () => {
    const parsed = normalizeOpenAIParsedParams({
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
        nonStop: null,
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 0, childAges: null }],
      },
      budget: null,
      tripType: "ROUND_TRIP",
      preferences: {
        flights: { stops: null, sort: null, refundableOnly: null, airlines: null },
        hotels: null,
      },
    });

    expect(parsed.preferences).toBeUndefined();
  });

  it("sets nonStop when preferences request direct flights", () => {
    const parsed = normalizeOpenAIParsedParams({
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
        nonStop: null,
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 0, childAges: null }],
      },
      budget: null,
      tripType: "ROUND_TRIP",
      preferences: {
        flights: { stops: "direct", sort: null, refundableOnly: null, airlines: null },
        hotels: { sort: null, minStars: null, board: null },
      },
    });

    expect(parsed.flights.nonStop).toBe(true);
    expect(parsed.preferences?.flights?.stops).toBe("direct");
  });
});

describe("parseTripQueryWithOpenAI", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const llmPayload = {
    flights: {
      origin: "DXB",
      destination: "LON",
      departureDate: "2026-12-20",
      returnDate: "2026-12-27",
      passengers: { adults: 2, children: 2, infants: 0 },
      cabin: "ECONOMY",
      nonStop: null,
    },
    hotels: {
      destination: "London",
      destinationCode: "LON",
      checkIn: "2026-12-20",
      checkOut: "2026-12-27",
      occupancies: [{ rooms: 1, adults: 2, children: 2, childAges: [8, 10] }],
    },
    budget: { maxTotal: 3000, currency: "USD" },
    tripType: "ROUND_TRIP",
    preferences: null,
  };

  it("includes prompt_cache_key on chat completion requests", () => {
    const body = buildOpenAIChatRequestBody(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
      "gpt-4o-mini",
    );

    expect(body.prompt_cache_key).toBe(DEFAULT_PROMPT_CACHE_KEY);
    expect(body.messages[0].content).toBe(TRIP_PARSE_SYSTEM_PROMPT);
  });

  it("honors OPENAI_PROMPT_CACHE_KEY override", () => {
    vi.stubEnv("OPENAI_PROMPT_CACHE_KEY", "custom-trip-parse");

    expect(resolvePromptCacheKey()).toBe("custom-trip-parse");
    expect(
      buildOpenAIChatRequestBody("trip to Rome", "gpt-4o-mini").prompt_cache_key,
    ).toBe("custom-trip-parse");
  });

  it("calls OpenAI and returns normalized params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(llmPayload) } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await parseTripQueryWithOpenAI(
      "family of 4 from Dubai to London, December 20-27, budget $3000",
      "test-key",
      "gpt-4o-mini",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.prompt_cache_key).toBe(DEFAULT_PROMPT_CACHE_KEY);
    expect(result.flights.origin).toBe("DXB");
    expect(result.budget?.maxTotal).toBe(3000);
  });

  it("includes contextual user message when context is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(llmPayload) } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await parseTripQueryWithOpenAI("increase budget to $8000", "test-key", "gpt-4o-mini", {
      flights: llmPayload.flights,
      hotels: llmPayload.hotels,
      budget: { maxTotal: 5000, currency: "USD" },
      tripType: "ROUND_TRIP",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages[1].content).toContain("Previous trip context:");
    expect(body.messages[1].content).toContain("increase budget to $8000");
  });

  it("throws on non-ok API responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "server error",
      }),
    );

    await expect(
      parseTripQueryWithOpenAI("trip to London", "test-key", "gpt-4o-mini"),
    ).rejects.toThrow(/OpenAI API error: 500 — server error/);
  });

  it("throws on non-ok API responses when error bodies cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => {
          throw new Error("stream closed");
        },
      }),
    );

    await expect(
      parseTripQueryWithOpenAI("trip to London", "test-key", "gpt-4o-mini"),
    ).rejects.toThrow(/OpenAI API error: 502$/);
  });

  it("throws when the model returns empty content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "" } }] }),
      }),
    );

    await expect(
      parseTripQueryWithOpenAI("trip to London", "test-key", "gpt-4o-mini"),
    ).rejects.toThrow(/Empty LLM response/);
  });

  it("keeps non-null hotel preference fields after normalization", () => {
    const parsed = normalizeOpenAIParsedParams({
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
        nonStop: null,
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 0, childAges: null }],
      },
      budget: null,
      tripType: "ROUND_TRIP",
      preferences: {
        flights: null,
        hotels: { sort: "rating", minStars: 4, board: "BB" },
      },
    });

    expect(parsed.preferences?.hotels).toEqual({
      sort: "rating",
      minStars: 4,
      board: "BB",
    });
  });

  it("skips occupancy normalization when hotels are absent", () => {
    expect(() =>
      normalizeOpenAIParsedParams({
        flights: {
          origin: "DXB",
          destination: "LON",
          departureDate: "2026-12-20",
          returnDate: "2026-12-27",
          passengers: { adults: 2, children: 0, infants: 0 },
          cabin: "ECONOMY",
          nonStop: null,
        },
        budget: null,
        tripType: "ROUND_TRIP",
        preferences: null,
      }),
    ).toThrow();
  });

  it("strips null keys from both flight and hotel preference objects", () => {
    const parsed = normalizeOpenAIParsedParams({
      flights: {
        origin: "DXB",
        destination: "LON",
        departureDate: "2026-12-20",
        returnDate: "2026-12-27",
        passengers: { adults: 2, children: 0, infants: 0 },
        cabin: "ECONOMY",
        nonStop: null,
      },
      hotels: {
        destination: "London",
        destinationCode: "LON",
        checkIn: "2026-12-20",
        checkOut: "2026-12-27",
        occupancies: [{ rooms: 1, adults: 2, children: 0, childAges: null }],
      },
      budget: null,
      tripType: "ROUND_TRIP",
      preferences: {
        flights: { stops: null, sort: "price", refundableOnly: null, airlines: null },
        hotels: { sort: null, minStars: 5, board: null },
      },
    });

    expect(parsed.preferences?.flights?.sort).toBe("price");
    expect(parsed.preferences?.hotels?.minStars).toBe(5);
  });

  it("throws on abort timeout", async () => {
    vi.stubEnv("LLM_PARSE_TIMEOUT_MS", "25");
    vi.resetModules();

    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const fail = () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (init?.signal?.aborted) {
            fail();
            return;
          }
          init?.signal?.addEventListener("abort", fail, { once: true });
        });
      }),
    );

    const { parseTripQueryWithOpenAI: parseWithShortTimeout } = await import(
      "@/lib/llm/openai-parse"
    );

    await expect(
      parseWithShortTimeout("trip to London", "test-key", "gpt-4o-mini"),
    ).rejects.toThrow(/timed out after 25ms/i);

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
