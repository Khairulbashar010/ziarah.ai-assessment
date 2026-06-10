import curatedRoutes from "@/mocks/seed/routes.json";
import { getAirportByCode } from "@/lib/geo/airports";
import { resolveDisplayAirport } from "@/lib/geo/metro-cities";
import { haversineKm } from "@/lib/geo/great-circle";
import { hashString, pickFrom } from "@/mocks/seed/hash";
import type { RouteOffer, RouteSeed } from "@/mocks/seed/types";

const CARRIERS = ["AA", "BA", "DL", "UA", "LH", "AF", "EK", "QR", "SQ", "TK", "JL", "NH"];
const DEPARTURE_SLOTS = ["06:15", "09:40", "13:05", "16:30", "20:55", "23:10"];

function resolveAirport(code: string) {
  const normalized = code.toUpperCase();
  const direct = getAirportByCode(normalized);
  if (direct) {
    return { searchCode: normalized, airportCode: normalized, airport: direct };
  }

  const displayCode = resolveDisplayAirport(normalized);
  const displayAirport = getAirportByCode(displayCode);
  if (displayAirport) {
    return { searchCode: normalized, airportCode: displayCode, airport: displayAirport };
  }

  return null;
}

function formatClock(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildOffer(
  routeKey: string,
  originCode: string,
  destinationCode: string,
  index: number,
  durationMinutes: number,
  stops: number,
): RouteOffer {
  const carrier = pickFrom(CARRIERS, routeKey, index);
  const departure = pickFrom(DEPARTURE_SLOTS, routeKey, index + 3);
  const [hours, minutes] = departure.split(":").map(Number);
  const arrivalMinutes = hours * 60 + minutes + durationMinutes;
  const flightBase = 100 + (hashString(`${routeKey}:${carrier}`) % 9000);

  return {
    carrier,
    flightNumber: String(flightBase + index),
    origin: originCode,
    destination: destinationCode,
    departure,
    arrival: formatClock(arrivalMinutes),
    stops,
    priceMultiplier: roundMultiplier(1 - index * 0.06),
  };
}

function roundMultiplier(value: number) {
  return Math.round(value * 100) / 100;
}

export function generateRouteSeed(origin: string, destination: string): RouteSeed | null {
  const originAirport = resolveAirport(origin);
  const destinationAirport = resolveAirport(destination);

  if (!originAirport || !destinationAirport) {
    return null;
  }

  if (originAirport.airportCode === destinationAirport.airportCode) {
    return null;
  }

  const routeKey = `${origin.toUpperCase()}-${destination.toUpperCase()}`;
  const distanceKm = haversineKm(
    { lat: originAirport.airport.lat, lon: originAirport.airport.lon },
    { lat: destinationAirport.airport.lat, lon: destinationAirport.airport.lon },
  );
  const durationMinutes = Math.max(75, Math.round((distanceKm / 820) * 60 + 35));
  const priceMin = Math.max(79, Math.round(distanceKm * 0.11 + 95));
  const priceMax = Math.round(priceMin * (1.35 + (hashString(routeKey) % 25) / 100));
  const offerCount = 2 + (hashString(`${routeKey}:offers`) % 2);
  const longHaul = distanceKm > 3500;

  const offers = Array.from({ length: offerCount }, (_, index) => {
    const stops = index === 0 ? 0 : longHaul ? 1 : 0;
    const legMinutes =
      stops === 0 ? durationMinutes : Math.round(durationMinutes * (0.55 + index * 0.1));

    return buildOffer(
      routeKey,
      originAirport.airportCode,
      destinationAirport.airportCode,
      index,
      legMinutes,
      stops,
    );
  });

  return {
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    priceMin,
    priceMax,
    durationMinutes,
    offers,
  };
}

export function resolveRouteSeed(origin: string, destination: string): RouteSeed | null {
  const routeKey = `${origin.toUpperCase()}-${destination.toUpperCase()}`;
  const curated = (curatedRoutes as Record<string, RouteSeed>)[routeKey];
  if (curated) {
    return curated;
  }

  return generateRouteSeed(origin, destination);
}
