import type { PublicFlightOffer, UnifiedFlightOffer, UnifiedHotelOffer } from "@/lib/types/trip";

type RankableFlightOffer = Pick<UnifiedFlightOffer, "durationMinutes" | "stops" | "totalPrice">;

/** Best-fit ranking: fastest route first, then fewer stops, then lower price. */
export function compareFlightOffers(a: RankableFlightOffer, b: RankableFlightOffer): number {
  if (a.durationMinutes !== b.durationMinutes) {
    return a.durationMinutes - b.durationMinutes;
  }
  if (a.stops !== b.stops) {
    return a.stops - b.stops;
  }
  return a.totalPrice - b.totalPrice;
}

export function rankFlightOffers(offers: UnifiedFlightOffer[]): UnifiedFlightOffer[] {
  return [...offers].sort(compareFlightOffers);
}

export function rankHotelOffers(offers: UnifiedHotelOffer[]): UnifiedHotelOffer[] {
  return [...offers].sort((a, b) => a.totalPrice - b.totalPrice);
}
