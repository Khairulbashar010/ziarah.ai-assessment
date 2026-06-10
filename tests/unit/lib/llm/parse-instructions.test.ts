import { describe, expect, it } from "vitest";
import { buildContextualUserMessage } from "@/lib/llm/parse-instructions";
import type { TripSearchParams } from "@/lib/types/trip";

const context: TripSearchParams = {
  tripType: "ROUND_TRIP",
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
};

describe("buildContextualUserMessage", () => {
  it("returns the raw query when no context is provided", () => {
    expect(buildContextualUserMessage("increase budget to $8000")).toBe(
      "increase budget to $8000",
    );
    expect(buildContextualUserMessage("trip to Rome", null)).toBe("trip to Rome");
  });

  it("wraps the query with serialized trip context", () => {
    const message = buildContextualUserMessage("increase budget to $8000", context);

    expect(message).toContain("Previous trip context:");
    expect(message).toContain('"origin":"DXB"');
    expect(message).toContain("User message:");
    expect(message).toContain("increase budget to $8000");
  });
});
