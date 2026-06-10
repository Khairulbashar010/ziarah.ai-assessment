import { describe, expect, it } from "vitest";
import { tripSearchRequestSchema } from "@/lib/api/trip-search-request";

const validContext = {
  tripType: "ROUND_TRIP" as const,
  flights: {
    origin: "DXB",
    destination: "LON",
    departureDate: "2026-12-20",
    returnDate: "2026-12-27",
    passengers: { adults: 2, children: 0, infants: 0 },
    cabin: "ECONOMY" as const,
  },
  hotels: {
    destination: "London",
    destinationCode: "LON",
    checkIn: "2026-12-20",
    checkOut: "2026-12-27",
    occupancies: [{ rooms: 1, adults: 2, children: 0 }],
  },
};

describe("tripSearchRequestSchema", () => {
  it("accepts a valid query with optional context", () => {
    const result = tripSearchRequestSchema.safeParse({
      query: "Dubai to London in December",
      context: validContext,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid query without context", () => {
    const result = tripSearchRequestSchema.safeParse({
      query: "Plan a trip to London",
    });

    expect(result.success).toBe(true);
  });

  it("rejects queries that are too short", () => {
    const result = tripSearchRequestSchema.safeParse({ query: "hi" });
    expect(result.success).toBe(false);
  });

  it("rejects queries that are too long", () => {
    const result = tripSearchRequestSchema.safeParse({
      query: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid context payloads", () => {
    const result = tripSearchRequestSchema.safeParse({
      query: "Dubai to London",
      context: {
        ...validContext,
        flights: { ...validContext.flights, origin: "DUBAI" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects context with excessive children counts", () => {
    const result = tripSearchRequestSchema.safeParse({
      query: "Dubai to London",
      context: {
        ...validContext,
        flights: {
          ...validContext.flights,
          passengers: { adults: 2, children: 1_000_000, infants: 0 },
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
