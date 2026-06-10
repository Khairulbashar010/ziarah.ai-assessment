import { describe, expect, it } from "vitest";
import {
  comboWithinBudgetFlag,
  findCheapestCompatibleHotel,
  pickCheapestCombo,
} from "./trip-budget";
import type { PublicFlightOffer, PublicHotelOffer } from "@/lib/types/trip";

const flight = (id: string, price: number): PublicFlightOffer => ({
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
});

const hotel = (id: string, price: number): PublicHotelOffer => ({
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
});

describe("trip budget helpers", () => {
  it("flags combo budget status", () => {
    expect(comboWithinBudgetFlag(1200, 800, 3000)).toBe(true);
    expect(comboWithinBudgetFlag(2000, 1500, 3000)).toBe(false);
    expect(comboWithinBudgetFlag(1200, 800)).toBeUndefined();
  });

  it("picks the cheapest valid combo", () => {
    expect(
      pickCheapestCombo(
        [flight("f1", 1200), flight("f2", 2500)],
        [hotel("h1", 800), hotel("h2", 1500)],
        3000,
      ),
    ).toEqual({ flightId: "f1", hotelId: "h1" });
  });

  it("finds the cheapest compatible hotel for a flight", () => {
    const hotels = [hotel("h1", 800), hotel("h2", 1500)];
    expect(findCheapestCompatibleHotel(flight("f1", 1200), hotels, 3000)?.id).toBe("h1");
  });
});
