import { describe, it, expect } from "vitest";
import { filterOffersByBudget, minComboPrice } from "./budget-filter";
import type { UnifiedFlightOffer, UnifiedHotelOffer } from "@/lib/types/trip";

const flight = (id: string, price: number): UnifiedFlightOffer => ({
  id,
  provider: "sabre",
  validatingCarrier: "EK",
  totalPrice: price,
  currency: "USD",
  perPassenger: price,
  stops: 0,
  durationMinutes: 480,
  segments: [],
  refundable: true,
  raw: {},
});

const hotel = (id: string, price: number): UnifiedHotelOffer => ({
  id,
  provider: "hotelbeds",
  hotelName: "Test Hotel",
  hotelCode: 1,
  destinationCode: "LON",
  category: "4 STARS",
  checkIn: "2025-12-20",
  checkOut: "2025-12-27",
  roomName: "Standard",
  boardName: "BB",
  nights: 7,
  totalPrice: price,
  currency: "USD",
  rateType: "BOOKABLE",
  cancellationPolicies: [],
  raw: {},
});

describe("filterOffersByBudget", () => {
  it("keeps only offers that can form a combo within budget", () => {
    const flights = [flight("f1", 1200), flight("f2", 2500)];
    const hotels = [hotel("h1", 800), hotel("h2", 1500)];

    const { flights: filteredFlights, hotels: filteredHotels } = filterOffersByBudget(
      flights,
      hotels,
      3000,
    );

    expect(filteredFlights.map((f) => f.id)).toEqual(["f1"]);
    expect(filteredHotels.map((h) => h.id)).toEqual(["h1", "h2"]);
  });

  it("computes the cheapest combo price", () => {
    expect(
      minComboPrice(
        [flight("f1", 1200), flight("f2", 2500)],
        [hotel("h1", 800), hotel("h2", 1500)],
      ),
    ).toBe(2000);
  });

  it("returns empty lists when no combo fits the budget", () => {
    const { flights, hotels } = filterOffersByBudget(
      [flight("f1", 2000)],
      [hotel("h1", 1500)],
      3000,
    );

    expect(flights).toHaveLength(0);
    expect(hotels).toHaveLength(0);
  });
});
