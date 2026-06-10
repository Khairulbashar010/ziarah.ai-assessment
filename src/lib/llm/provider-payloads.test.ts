import { describe, expect, it } from "vitest";
import { toProviderFanOutPayload } from "./provider-payloads";
import type { TripSearchParams } from "@/lib/types/trip";

const assessmentExample: TripSearchParams = {
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

describe("toProviderFanOutPayload", () => {
  it("maps one TripSearchParams to three provider payloads", () => {
    const payload = toProviderFanOutPayload(assessmentExample);

    expect(payload.sabre).toBe(assessmentExample.flights);
    expect(payload.amadeus).toBe(assessmentExample.flights);
    expect(payload.hotelbeds).toBe(assessmentExample.hotels);
  });

  it("shares flight params between Sabre and Amadeus", () => {
    const payload = toProviderFanOutPayload(assessmentExample);
    expect(payload.sabre).toEqual(payload.amadeus);
  });
});
