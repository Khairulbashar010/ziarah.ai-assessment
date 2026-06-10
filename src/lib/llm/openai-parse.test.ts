import { describe, expect, it } from "vitest";
import { TRIP_PARSE_SYSTEM_PROMPT } from "./parse-instructions";
import { buildOpenAITripSchema, normalizeOpenAIParsedParams } from "./openai-parse";
import { tripSearchParamsSchema } from "./schemas";

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
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("3k");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("omit entirely unless");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("non-stop");
    expect(TRIP_PARSE_SYSTEM_PROMPT).toContain("minStars");
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
