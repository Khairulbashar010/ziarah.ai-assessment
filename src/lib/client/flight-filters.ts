import type { PublicFlightOffer } from "@/lib/types/trip";
import { compareFlightOffers } from "@/lib/trip-search/rank-offers";

export type FlightSortOption = "best" | "price" | "duration" | "departure";

export type FlightStopsFilter = "any" | "direct" | "1" | "2plus";

export type FlightFilterState = {
  sort: FlightSortOption;
  stops: FlightStopsFilter;
  maxPrice: number | null;
  airlines: string[];
  refundableOnly: boolean;
  withinBudgetOnly: boolean;
};

export function getDefaultFlightFilters(
  offers: PublicFlightOffer[],
  budgetMax?: number,
): FlightFilterState {
  const maxOfferPrice = offers.reduce((max, o) => Math.max(max, o.totalPrice), 0);

  return {
    sort: "best",
    stops: "any",
    maxPrice: budgetMax ?? (maxOfferPrice > 0 ? maxOfferPrice : null),
    airlines: [],
    refundableOnly: false,
    withinBudgetOnly: Boolean(budgetMax),
  };
}

export function getAvailableAirlines(offers: PublicFlightOffer[]): string[] {
  const carriers = new Set<string>();
  for (const offer of offers) {
    carriers.add(offer.validatingCarrier);
    for (const segment of offer.segments) {
      carriers.add(segment.carrier);
    }
  }
  return [...carriers].sort();
}

export function getPriceRange(offers: PublicFlightOffer[]): { min: number; max: number } {
  if (offers.length === 0) return { min: 0, max: 0 };
  const prices = offers.map((o) => o.totalPrice);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function matchesStops(stops: number, filter: FlightStopsFilter): boolean {
  if (filter === "any") return true;
  if (filter === "direct") return stops === 0;
  if (filter === "1") return stops === 1;
  return stops >= 2;
}

export function applyFlightFilters(
  offers: PublicFlightOffer[],
  filters: FlightFilterState,
  budgetMax?: number,
): PublicFlightOffer[] {
  let result = offers.filter((offer) => {
    if (!matchesStops(offer.stops, filters.stops)) return false;
    if (filters.maxPrice !== null && offer.totalPrice > filters.maxPrice) return false;
    if (filters.refundableOnly && !offer.refundable) return false;
    if (filters.withinBudgetOnly && budgetMax !== undefined && offer.totalPrice > budgetMax) {
      return false;
    }
    if (filters.airlines.length > 0) {
      const carriers = new Set([
        offer.validatingCarrier,
        ...offer.segments.map((s) => s.carrier),
      ]);
      if (!filters.airlines.some((a) => carriers.has(a))) return false;
    }
    return true;
  });

  result = [...result].sort((a, b) => {
    if (filters.sort === "best") return compareFlightOffers(a, b);
    if (filters.sort === "price") return a.totalPrice - b.totalPrice;
    if (filters.sort === "duration") return a.durationMinutes - b.durationMinutes;
    const aDep = a.segments[0]?.departure ?? "";
    const bDep = b.segments[0]?.departure ?? "";
    return aDep.localeCompare(bDep);
  });

  return result;
}

export function countActiveFilters(filters: FlightFilterState, defaults: FlightFilterState): number {
  let count = 0;
  if (filters.stops !== defaults.stops) count += 1;
  if (filters.refundableOnly) count += 1;
  if (filters.airlines.length > 0) count += 1;
  if (filters.maxPrice !== null && filters.maxPrice !== defaults.maxPrice) count += 1;
  if (filters.withinBudgetOnly !== defaults.withinBudgetOnly) count += 1;
  return count;
}
