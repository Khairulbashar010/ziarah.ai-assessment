import { createHash } from "node:crypto";
import type { TripSearchParams } from "@/lib/types/trip";

/** Stable cache key from normalized search params (not the raw NL query). */
export function buildTripSearchCacheKey(params: TripSearchParams): string {
  const normalized = {
    tripType: params.tripType,
    flights: {
      origin: params.flights.origin.trim().toUpperCase(),
      destination: params.flights.destination.trim().toUpperCase(),
      departureDate: params.flights.departureDate,
      returnDate: params.flights.returnDate ?? null,
      passengers: params.flights.passengers,
      cabin: params.flights.cabin,
      nonStop:
        params.flights.nonStop === true || params.preferences?.flights?.stops === "direct"
          ? true
          : null,
    },
    hotels: {
      destinationCode: params.hotels.destinationCode.trim().toUpperCase(),
      checkIn: params.hotels.checkIn,
      checkOut: params.hotels.checkOut,
      occupancies: params.hotels.occupancies,
    },
    budget: params.budget
      ? { maxTotal: params.budget.maxTotal, currency: params.budget.currency }
      : null,
  };

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
