import { describe, expect, it } from "vitest";
import { applyTripModifications } from "./apply-trip-modifications";
import type { TripSearchParams } from "@/lib/types/trip";

const base: TripSearchParams = {
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
    occupancies: [{ rooms: 1, adults: 2, children: 2, childAges: [8, 9] }],
  },
  budget: { maxTotal: 5000, currency: "USD" },
  tripType: "ROUND_TRIP",
};

describe("applyTripModifications", () => {
  it("updates budget while keeping route and dates", () => {
    const result = applyTripModifications("increase budget to $8000", base);
    expect(result?.budget?.maxTotal).toBe(8000);
    expect(result?.flights.origin).toBe("DXB");
    expect(result?.hotels.checkIn).toBe("2026-12-20");
  });

  it("expands k suffix in budget slang", () => {
    const result = applyTripModifications("Make budget to 3k", base);
    expect(result?.budget?.maxTotal).toBe(3000);
  });

  it("updates dates while keeping other fields", () => {
    const result = applyTripModifications("change dates to January 5-12", base);
    expect(result?.flights.departureDate).toBe("2026-01-05");
    expect(result?.flights.returnDate).toBe("2026-01-12");
    expect(result?.flights.origin).toBe("DXB");
  });

  it("updates passenger count", () => {
    const result = applyTripModifications("family of 5", base);
    expect(result?.flights.passengers).toEqual({ adults: 3, children: 2, infants: 0 });
    expect(result?.hotels.occupancies[0].adults).toBe(3);
  });

  it("returns null when no recognizable change", () => {
    expect(applyTripModifications("looks good", base)).toBeNull();
  });

  it("updates flight preferences for direct-only requests", () => {
    const result = applyTripModifications("show me direct flights only", base);
    expect(result?.preferences?.flights?.stops).toBe("direct");
    expect(result?.flights.nonStop).toBe(true);
  });

  it("updates hotel sort preference", () => {
    const result = applyTripModifications("sort hotels by rating", base);
    expect(result?.preferences?.hotels?.sort).toBe("rating");
  });
});
