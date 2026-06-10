import type { UnifiedFlightOffer, UnifiedHotelOffer } from "@/lib/types/trip";

/** Keep flights whose fare is within the trip budget. */
export function filterFlightsByBudget(
  flights: UnifiedFlightOffer[],
  maxTotal: number,
): UnifiedFlightOffer[] {
  return flights.filter((flight) => flight.totalPrice <= maxTotal);
}

/** Keep hotels whose rate is within the trip budget. */
export function filterHotelsByBudget(
  hotels: UnifiedHotelOffer[],
  maxTotal: number,
): UnifiedHotelOffer[] {
  return hotels.filter((hotel) => hotel.totalPrice <= maxTotal);
}

/** Cheapest flight + hotel combo across all pairs. */
export function minComboPrice(
  flights: UnifiedFlightOffer[],
  hotels: UnifiedHotelOffer[],
): number | null {
  let min: number | null = null;

  for (const flight of flights) {
    for (const hotel of hotels) {
      const total = flight.totalPrice + hotel.totalPrice;
      if (min === null || total < min) {
        min = total;
      }
    }
  }

  return min;
}

/** Keep only offers that can pair with at least one other offer within the trip budget. */
export function filterOffersByBudget(
  flights: UnifiedFlightOffer[],
  hotels: UnifiedHotelOffer[],
  maxTotal: number,
): { flights: UnifiedFlightOffer[]; hotels: UnifiedHotelOffer[] } {
  const validFlightIds = new Set<string>();
  const validHotelIds = new Set<string>();

  for (const flight of flights) {
    for (const hotel of hotels) {
      if (flight.totalPrice + hotel.totalPrice <= maxTotal) {
        validFlightIds.add(flight.id);
        validHotelIds.add(hotel.id);
      }
    }
  }

  return {
    flights: flights.filter((f) => validFlightIds.has(f.id)),
    hotels: hotels.filter((h) => validHotelIds.has(h.id)),
  };
}
