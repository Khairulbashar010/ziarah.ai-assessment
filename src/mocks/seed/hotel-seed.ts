import curatedHotels from "@/mocks/seed/curated-hotels.json";
import generatedHotels from "@/mocks/seed/hotels.json";
import { getAirportByCode } from "@/lib/geo/airports";
import { METRO_CITIES, resolveDisplayAirport } from "@/lib/geo/metro-cities";
import { hashString } from "@/mocks/seed/hash";
import type { HotelSeed } from "@/mocks/seed/types";

const HOTEL_SUFFIXES = ["Airport Hotel", "City Inn", "Grand", "Suites", "Riverside"];
const CATEGORIES = ["3 STARS", "4 STARS", "5 STARS"];

function hotelCodeFor(destinationCode: string, variant: number) {
  return 10000 + ((hashString(`${destinationCode}:${variant}`) >>> 0) % 89000);
}

export function generateHotelsForAirport(
  destinationCode: string,
  airport: { city: string; lat: number; lon: number },
): HotelSeed[] {
  const variantCount = 1 + (hashString(destinationCode) % 2);

  return Array.from({ length: variantCount }, (_, index) => {
    const suffix = HOTEL_SUFFIXES[(hashString(destinationCode) + index) % HOTEL_SUFFIXES.length];
    const category = CATEGORIES[(hashString(`${destinationCode}:cat`) + index) % CATEGORIES.length];
    const priceBase = 70 + (hashString(`${destinationCode}:price`) % 220);
    const starBoost = category.startsWith("5") ? 55 : category.startsWith("4") ? 25 : 0;

    return {
      code: hotelCodeFor(destinationCode, index),
      name: `${airport.city} ${suffix}`,
      destinationCode: destinationCode.toUpperCase(),
      category,
      lat: roundCoord(airport.lat + index * 0.004),
      lng: roundCoord(airport.lon - index * 0.003),
      pricePerNight: priceBase + starBoost,
    };
  });
}

function roundCoord(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function resolveHotelsForDestination(destinationCode: string): HotelSeed[] {
  const code = destinationCode.toUpperCase();
  const curatedMatches = (curatedHotels as HotelSeed[]).filter(
    (hotel) => hotel.destinationCode === code,
  );
  if (curatedMatches.length > 0) {
    return curatedMatches;
  }

  const staticMatches = (generatedHotels as HotelSeed[]).filter(
    (hotel) => hotel.destinationCode === code,
  );
  if (staticMatches.length > 0) {
    return staticMatches;
  }

  const displayCode = resolveDisplayAirport(code);
  const airport = getAirportByCode(displayCode) ?? getAirportByCode(code);
  if (!airport) {
    return [];
  }

  return generateHotelsForAirport(code, {
    city: airport.city,
    lat: airport.lat,
    lon: airport.lon,
  });
}

export function listAllHotelDestinations(): string[] {
  const codes = new Set<string>();
  for (const hotel of [...(curatedHotels as HotelSeed[]), ...(generatedHotels as HotelSeed[])]) {
    codes.add(hotel.destinationCode);
  }
  for (const metro of Object.values(METRO_CITIES)) {
    codes.add(metro.searchCode);
  }
  return [...codes].sort();
}
