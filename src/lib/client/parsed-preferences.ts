import type { FlightFilterState } from "@/lib/client/flight-filters";
import type { TripSearchParams } from "@/lib/types/trip";

type HotelSortOption = "best" | "price" | "rating";

export type HotelFilterDefaults = {
  sort: HotelSortOption;
  minStars?: number;
  withinBudgetOnly: boolean;
};

export function flightFiltersFromPreferences(
  preferences: TripSearchParams["preferences"],
  defaults: FlightFilterState,
): FlightFilterState {
  const flightPrefs = preferences?.flights;
  if (!flightPrefs) return defaults;

  return {
    ...defaults,
    stops: flightPrefs.stops ?? defaults.stops,
    sort: flightPrefs.sort ?? defaults.sort,
    refundableOnly: flightPrefs.refundableOnly ?? defaults.refundableOnly,
    airlines: flightPrefs.airlines ?? defaults.airlines,
  };
}

export function hotelFiltersFromPreferences(
  preferences: TripSearchParams["preferences"],
  defaults: HotelFilterDefaults,
): HotelFilterDefaults {
  const hotelPrefs = preferences?.hotels;
  if (!hotelPrefs) return defaults;

  return {
    ...defaults,
    sort: hotelPrefs.sort ?? defaults.sort,
    minStars: hotelPrefs.minStars ?? defaults.minStars,
  };
}
