import type { PublicFlightOffer, PublicHotelOffer } from "@/lib/types/trip";

export function isComboWithinBudget(
  flightPrice: number,
  hotelPrice: number,
  budgetMax?: number,
): boolean {
  if (budgetMax === undefined) return true;
  return flightPrice + hotelPrice <= budgetMax;
}

export function comboWithinBudgetFlag(
  flightPrice: number,
  hotelPrice: number,
  budgetMax?: number,
): boolean | undefined {
  if (budgetMax === undefined) return undefined;
  return isComboWithinBudget(flightPrice, hotelPrice, budgetMax);
}

export function maxAffordablePrice(budgetMax: number, pairedPrice: number): number {
  return Math.max(0, budgetMax - pairedPrice);
}

export function findCheapestCompatibleHotel(
  flight: PublicFlightOffer,
  hotels: PublicHotelOffer[],
  budgetMax?: number,
): PublicHotelOffer | undefined {
  const compatible = budgetMax
    ? hotels.filter((hotel) => isComboWithinBudget(flight.totalPrice, hotel.totalPrice, budgetMax))
    : hotels;

  return [...compatible].sort((a, b) => a.totalPrice - b.totalPrice)[0];
}

export function findCheapestCompatibleFlight(
  hotel: PublicHotelOffer,
  flights: PublicFlightOffer[],
  budgetMax?: number,
): PublicFlightOffer | undefined {
  const compatible = budgetMax
    ? flights.filter((flight) => isComboWithinBudget(flight.totalPrice, hotel.totalPrice, budgetMax))
    : flights;

  return [...compatible].sort((a, b) => a.totalPrice - b.totalPrice)[0];
}

export function pickCheapestCombo(
  flights: PublicFlightOffer[],
  hotels: PublicHotelOffer[],
  budgetMax?: number,
): { flightId: string | null; hotelId: string | null } {
  let best: { flight: PublicFlightOffer; hotel: PublicHotelOffer; total: number } | null = null;

  for (const flight of flights) {
    for (const hotel of hotels) {
      const total = flight.totalPrice + hotel.totalPrice;
      if (budgetMax !== undefined && total > budgetMax) continue;
      if (!best || total < best.total) {
        best = { flight, hotel, total };
      }
    }
  }

  if (best) {
    return { flightId: best.flight.id, hotelId: best.hotel.id };
  }

  return {
    flightId: flights[0]?.id ?? null,
    hotelId: hotels[0]?.id ?? null,
  };
}
