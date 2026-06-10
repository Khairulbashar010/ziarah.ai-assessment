import type {
  PublicFlightOffer,
  PublicHotelOffer,
  TripOffersUpdate,
  TripSearchResponse,
  TripSearchResult,
  UnifiedFlightOffer,
  UnifiedHotelOffer,
} from "@/lib/types/trip";
import { clientMaxFlightOffers, clientMaxHotelOffers } from "@/lib/trip-search/offer-limits";

function stripFlightOffer(offer: UnifiedFlightOffer): PublicFlightOffer {
  const { raw: _raw, ...publicOffer } = offer;
  return publicOffer;
}

function stripHotelOffer(offer: UnifiedHotelOffer): PublicHotelOffer {
  const { raw: _raw, ...publicOffer } = offer;
  return publicOffer;
}

function capFlightOffers(offers: UnifiedFlightOffer[]) {
  const limit = clientMaxFlightOffers();
  const totalOffers = offers.length;
  return {
    totalOffers,
    truncated: totalOffers > limit,
    offers: offers.slice(0, limit).map(stripFlightOffer),
  };
}

function capHotelOffers(offers: UnifiedHotelOffer[]) {
  const limit = clientMaxHotelOffers();
  const totalOffers = offers.length;
  return {
    totalOffers,
    truncated: totalOffers > limit,
    offers: offers.slice(0, limit).map(stripHotelOffer),
  };
}

export function toClientTripResponse(result: TripSearchResult): TripSearchResponse {
  const flights = capFlightOffers(result.flights.offers);
  const hotels = capHotelOffers(result.hotels.offers);

  return {
    requestId: result.requestId,
    parsedQuery: result.parsedQuery,
    meta: result.meta,
    providers: result.providers,
    flights: {
      ...flights,
      withinBudget: result.flights.withinBudget,
    },
    hotels,
    tripSummary: result.tripSummary,
  };
}

export function toClientOffersUpdate(result: TripSearchResult): TripOffersUpdate {
  const client = toClientTripResponse(result);
  return {
    meta: client.meta,
    providers: client.providers,
    flights: client.flights,
    hotels: client.hotels,
    tripSummary: client.tripSummary,
  };
}

export function applyOffersUpdate(
  base: TripSearchResponse,
  update: TripOffersUpdate,
): TripSearchResponse {
  return {
    ...base,
    meta: update.meta,
    providers: update.providers,
    flights: update.flights,
    hotels: update.hotels,
    tripSummary: update.tripSummary,
  };
}
