import { getAirportByCode } from "@/lib/geo/airports";
import { resolveDisplayAirport } from "@/lib/geo/metro-cities";
import { resolveHotelsForDestination } from "@/mocks/seed/hotel-seed";

export function resolveDestinationGeo(destinationCode: string): { lat: number; lng: number } {
  const code = destinationCode.toUpperCase();
  const matches = resolveHotelsForDestination(code);

  if (matches.length > 0) {
    const lat = matches.reduce((sum, hotel) => sum + hotel.lat, 0) / matches.length;
    const lng = matches.reduce((sum, hotel) => sum + hotel.lng, 0) / matches.length;
    return { lat, lng };
  }

  const displayCode = resolveDisplayAirport(code);
  const airport = getAirportByCode(displayCode) ?? getAirportByCode(code);
  if (airport) {
    return { lat: airport.lat, lng: airport.lon };
  }

  throw new Error(`No geolocation mapping for destination code ${code}`);
}
