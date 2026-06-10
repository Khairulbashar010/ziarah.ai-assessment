import type {
  FlightSearchParams,
  HotelSearchParams,
  TripSearchParams,
} from "@/lib/types/trip";

/** Fan-out payload derived from a single LLM parse — one object, three parallel provider calls. */
export type ProviderFanOutPayload = {
  /** Sabre Bargain Finder Max — `POST /v4.3.0/shop/flights` */
  sabre: FlightSearchParams;
  /** Amadeus Flight Offers Search — `GET /v2/shopping/flight-offers` */
  amadeus: FlightSearchParams;
  /** HotelBeds Availability — `POST /hotel-api/1.0/hotels` */
  hotelbeds: HotelSearchParams;
};

/**
 * Maps one TripSearchParams (LLM extraction output) into per-provider request bodies.
 * Sabre and Amadeus share the same flight search shape; HotelBeds uses hotel params.
 */
export function toProviderFanOutPayload(params: TripSearchParams): ProviderFanOutPayload {
  const nonStop = params.flights.nonStop ?? params.preferences?.flights?.stops === "direct";
  const flights = nonStop ? { ...params.flights, nonStop: true } : params.flights;

  return {
    sabre: flights,
    amadeus: flights,
    hotelbeds: params.hotels,
  };
}
