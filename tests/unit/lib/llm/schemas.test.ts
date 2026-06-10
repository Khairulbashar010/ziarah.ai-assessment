import { describe, expect, it } from "vitest";
import { tripSearchParamsSchema } from "@/lib/llm/schemas";

const validParams = {
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

describe("tripSearchParamsSchema", () => {
  it("normalizes lowercase IATA codes to uppercase", () => {
    const result = tripSearchParamsSchema.parse({
      ...validParams,
      flights: { ...validParams.flights, origin: "dxb", destination: "lon" },
      hotels: { ...validParams.hotels, destinationCode: "lon" },
    });

    expect(result.flights.origin).toBe("DXB");
    expect(result.flights.destination).toBe("LON");
    expect(result.hotels.destinationCode).toBe("LON");
  });

  it("rejects invalid IATA codes", () => {
    expect(
      tripSearchParamsSchema.safeParse({
        ...validParams,
        flights: { ...validParams.flights, origin: "DUBAI" },
      }).success,
    ).toBe(false);
  });

  it("rejects excessive passenger counts", () => {
    expect(
      tripSearchParamsSchema.safeParse({
        ...validParams,
        flights: {
          ...validParams.flights,
          passengers: { adults: 2, children: 1_000_000, infants: 0 },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects infants exceeding adults", () => {
    expect(
      tripSearchParamsSchema.safeParse({
        ...validParams,
        flights: {
          ...validParams.flights,
          passengers: { adults: 1, children: 0, infants: 2 },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects oversized hotel destination strings", () => {
    expect(
      tripSearchParamsSchema.safeParse({
        ...validParams,
        hotels: { ...validParams.hotels, destination: "a".repeat(201) },
      }).success,
    ).toBe(false);
  });

  it("uppercases lowercase airline preference codes", () => {
    const result = tripSearchParamsSchema.parse({
      ...validParams,
      preferences: {
        flights: { airlines: ["ek", "ba"] },
      },
    });

    expect(result.preferences?.flights?.airlines).toEqual(["EK", "BA"]);
  });

  it("rejects too many occupancies", () => {
    expect(
      tripSearchParamsSchema.safeParse({
        ...validParams,
        hotels: {
          ...validParams.hotels,
          occupancies: Array.from({ length: 6 }, () => ({
            rooms: 1,
            adults: 2,
            children: 0,
          })),
        },
      }).success,
    ).toBe(false);
  });
});
