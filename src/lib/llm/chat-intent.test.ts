import { describe, expect, it } from "vitest";
import { classifyChatIntent } from "./chat-intent";
import type { TripSearchParams } from "@/lib/types/trip";

const dubaiLondon: TripSearchParams = {
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

describe("classifyChatIntent", () => {
  it("treats first message as a new search", () => {
    expect(classifyChatIntent("family of 4 from Dubai to London", null)).toBe("new_search");
  });

  it("detects budget and date tweaks as modifications", () => {
    expect(classifyChatIntent("increase budget to $8000", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("change dates to December 25-30", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("make it 5 people", dubaiLondon)).toBe("modify");
  });

  it("detects a different route as a new search", () => {
    expect(classifyChatIntent("from Dubai to Paris instead", dubaiLondon)).toBe("new_search");
    expect(classifyChatIntent("start over — family of 2 from NYC to Tokyo", dubaiLondon)).toBe(
      "new_search",
    );
  });
});
