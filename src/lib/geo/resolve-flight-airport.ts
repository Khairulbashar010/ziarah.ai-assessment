import { parseFromTo } from "@/lib/utils/parse-from-to";
import type { TripSearchParams } from "@/lib/types/trip";
import { getAirportByCode, resolveAirportCode } from "./airports";
import { resolveDisplayAirport } from "./metro-cities";

const METRO_SEARCH_CODES = new Set(["DXB", "LON", "PAR", "TYO", "BKK", "NYC", "ROM", "BCN", "AMS", "SIN"]);

export function resolveFlightAirportCode(cityOrCode: string): string {
  const upper = cityOrCode.trim().toUpperCase();
  if (METRO_SEARCH_CODES.has(upper)) {
    return resolveDisplayAirport(upper);
  }
  const code = resolveAirportCode(cityOrCode) ?? upper;
  return resolveDisplayAirport(code);
}

export function inferRouteFromQuery(
  query: string,
  parsed?: TripSearchParams | null,
): {
  originCode: string;
  destinationCode: string;
  originLabel: string;
  destinationLabel: string;
} {
  if (parsed) {
    const originCode = resolveFlightAirportCode(parsed.flights.origin);
    const destinationCode = resolveFlightAirportCode(parsed.flights.destination);

    return {
      originCode,
      destinationCode,
      originLabel: getAirportByCode(originCode)?.city ?? parsed.flights.origin,
      destinationLabel: parsed.hotels.destination,
    };
  }

  const route = parseFromTo(query);
  if (route) {
    return {
      originCode: resolveFlightAirportCode(route.origin),
      destinationCode: resolveFlightAirportCode(route.destination),
      originLabel: route.origin,
      destinationLabel: route.destination,
    };
  }

  return {
    originCode: "DXB",
    destinationCode: "LHR",
    originLabel: "Dubai",
    destinationLabel: "London",
  };
}
