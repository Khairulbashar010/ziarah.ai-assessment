import airportsIndex from "@/data/airports-index.json";
import { resolveDisplayAirport, resolveMetroCity } from "./metro-cities";
import type { LatLon } from "./great-circle";

export type Airport = {
  lat: number;
  lon: number;
  city: string;
  name: string;
  country: string;
};

const index = airportsIndex as Record<string, Airport>;

export function getAirportByCode(code: string): Airport | undefined {
  return index[code.toUpperCase()];
}

export function getAirportCoords(code: string): LatLon | null {
  if (!code?.trim()) return null;

  const resolved = resolveDisplayAirport(code);
  const airport = getAirportByCode(resolved);
  if (!airport || typeof airport.lat !== "number" || typeof airport.lon !== "number") {
    return null;
  }

  return { lat: airport.lat, lon: airport.lon };
}

const FALLBACK_COORDS: Record<string, LatLon> = {
  DXB: { lat: 25.2532, lon: 55.3657 },
  LHR: { lat: 51.47, lon: -0.4543 },
};

/** Resolve any city/metro/IATA code to coordinates for map rendering. */
export function resolveAirportLatLon(code: string, fallback: LatLon = FALLBACK_COORDS.LHR): LatLon {
  const direct = getAirportCoords(code);
  if (direct) return direct;

  const resolved = resolveDisplayAirport(code);
  const resolvedCoords = getAirportCoords(resolved);
  if (resolvedCoords) return resolvedCoords;

  return FALLBACK_COORDS[resolved] ?? fallback;
}

export function resolveAirportCode(cityOrCode: string): string | null {
  const normalized = cityOrCode.trim().toLowerCase();

  if (normalized.length === 3 && index[normalized.toUpperCase()]) {
    return normalized.toUpperCase();
  }

  const metro = resolveMetroCity(normalized);
  if (metro) return metro.searchCode;

  const match = Object.entries(index).find(
    ([, airport]) =>
      airport.city.toLowerCase() === normalized ||
      airport.name.toLowerCase().includes(normalized),
  );

  return match?.[0] ?? null;
}

export function getCityLabel(code: string): string {
  return getAirportByCode(code)?.city ?? code;
}

export function getAirportLabel(code: string): string {
  const airport = getAirportByCode(code);
  if (!airport) return code;
  return `${airport.city} (${code})`;
}
