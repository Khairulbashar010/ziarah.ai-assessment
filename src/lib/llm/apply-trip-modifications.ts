import { getAirportByCode, resolveAirportCode } from "@/lib/geo/airports";
import { resolveMetroCity } from "@/lib/geo/metro-cities";
import type { TripSearchParams } from "@/lib/types/trip";
import { parseBudgetAmount } from "@/lib/utils/parse-budget-amount";
import { parseFromTo } from "@/lib/utils/parse-from-to";

const CARRIER_ALIASES: Record<string, string> = {
  emirates: "EK",
  "british airways": "BA",
  qatar: "QR",
  lufthansa: "LH",
  delta: "DL",
  united: "UA",
  american: "AA",
  airfrance: "AF",
  "air france": "AF",
  klm: "KL",
  etihad: "EY",
  turkish: "TK",
  singapore: "SQ",
  cathay: "CX",
};

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function resolveCity(cityName: string) {
  const metro = resolveMetroCity(cityName);
  if (metro) {
    return { airport: metro.searchCode, hotel: metro.searchCode, name: metro.name };
  }

  const code = resolveAirportCode(cityName);
  if (code) {
    const airport = getAirportByCode(code);
    return { airport: code, hotel: code, name: airport?.city ?? cityName };
  }

  return null;
}

const BUDGET_AMOUNT = String.raw`(\d[\d,]*(?:\.\d+)?)\s*([kmb])?`;

function parseBudget(message: string): TripSearchParams["budget"] | undefined {
  const normalized = message.toLowerCase();
  const match =
    normalized.match(
      new RegExp(
        `(?:budget|make(?:\\s+the)?\\s+budget|increase(?:\\s+the)?\\s+budget|adjust(?:\\s+the)?\\s+budget).*?\\$?${BUDGET_AMOUNT}`,
      ),
    ) ?? normalized.match(new RegExp(`\\$?${BUDGET_AMOUNT}\\b`));
  if (!match) return undefined;

  const amount = parseBudgetAmount(match[1], match[2]);
  if (amount === undefined) return undefined;
  return { maxTotal: amount, currency: "USD" };
}

function parseDates(
  message: string,
  yearHint: string,
): { departureDate: string; returnDate: string } | undefined {
  const rangeMatch = message.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/i,
  );
  if (!rangeMatch) return undefined;

  const month = MONTHS[rangeMatch[1].toLowerCase()];
  const departureDate = `${yearHint}-${month}-${rangeMatch[2].padStart(2, "0")}`;
  const returnDate = `${yearHint}-${month}-${rangeMatch[3].padStart(2, "0")}`;
  return { departureDate, returnDate };
}

function parsePassengers(message: string): TripSearchParams["flights"]["passengers"] | undefined {
  const normalized = message.toLowerCase();

  const familyMatch = normalized.match(/family of (\d+)/);
  if (familyMatch) {
    const total = Number(familyMatch[1]);
    const adults = Math.max(1, Math.ceil(total / 2));
    const children = Math.max(0, total - adults);
    return { adults, children, infants: 0 };
  }

  const peopleMatch = normalized.match(/(\d+)\s*(people|travell?ers?)/);
  if (peopleMatch) {
    const total = Number(peopleMatch[1]);
    const adults = Math.max(1, Math.ceil(total / 2));
    const children = Math.max(0, total - adults);
    return { adults, children, infants: 0 };
  }

  const adultsMatch = normalized.match(/(\d+)\s*adults?/);
  const childrenMatch = normalized.match(/(\d+)\s*(children|kids?)/);
  if (adultsMatch || childrenMatch) {
    const adults = adultsMatch ? Number(adultsMatch[1]) : 2;
    const children = childrenMatch ? Number(childrenMatch[1]) : 0;
    return { adults: Math.max(1, adults), children: Math.max(0, children), infants: 0 };
  }

  return undefined;
}

function syncHotelOccupancy(params: TripSearchParams) {
  const { adults, children } = params.flights.passengers;
  params.hotels.occupancies = [
    {
      rooms: 1,
      adults,
      children,
      childAges:
        children > 0
          ? Array.from({ length: children }, (_, i) => 8 + i)
          : undefined,
    },
  ];
}

function mergePreferences(
  base: TripSearchParams["preferences"],
  patch: TripSearchParams["preferences"],
): TripSearchParams["preferences"] {
  if (!patch) return base;
  return {
    flights: { ...base?.flights, ...patch.flights },
    hotels: { ...base?.hotels, ...patch.hotels },
  };
}

function parseFlightPreferences(
  message: string,
): TripSearchParams["preferences"] | undefined {
  const normalized = message.toLowerCase();
  const flights: NonNullable<TripSearchParams["preferences"]>["flights"] = {};
  let changed = false;

  if (/\b(direct|non-?stop|no stops?)\b/.test(normalized)) {
    flights.stops = "direct";
    changed = true;
  } else if (/\b(one stop|1 stop|single stop)\b/.test(normalized)) {
    flights.stops = "1";
    changed = true;
  } else if (/\b(2\+?\s*stops?|two stops?|multi-?stop)\b/.test(normalized)) {
    flights.stops = "2plus";
    changed = true;
  }

  if (/\b(cheapest|lowest price|sort by price)\b/.test(normalized)) {
    flights.sort = "price";
    changed = true;
  } else if (/\b(fastest|shortest|sort by duration)\b/.test(normalized)) {
    flights.sort = "duration";
    changed = true;
  } else if (/\b(earliest|sort by departure)\b/.test(normalized)) {
    flights.sort = "departure";
    changed = true;
  }

  if (/\brefundable\b/.test(normalized)) {
    flights.refundableOnly = true;
    changed = true;
  }

  const airlines: string[] = [];
  for (const [name, code] of Object.entries(CARRIER_ALIASES)) {
    if (normalized.includes(name)) {
      airlines.push(code);
    }
  }
  const codeMatch = normalized.match(/\b([A-Z]{2})\b/g);
  if (codeMatch) {
    for (const code of codeMatch) {
      if (!airlines.includes(code)) airlines.push(code);
    }
  }
  if (airlines.length > 0) {
    flights.airlines = airlines;
    changed = true;
  }

  return changed ? { flights } : undefined;
}

function parseHotelPreferences(
  message: string,
): TripSearchParams["preferences"] | undefined {
  const normalized = message.toLowerCase();
  const hotels: NonNullable<TripSearchParams["preferences"]>["hotels"] = {};
  let changed = false;

  if (/\b(cheapest hotel|lowest hotel price|sort hotels by price)\b/.test(normalized)) {
    hotels.sort = "price";
    changed = true;
  } else if (/\b(best rated|highest rated|sort hotels by rating|top rated)\b/.test(normalized)) {
    hotels.sort = "rating";
    changed = true;
  }

  const starsMatch = normalized.match(/(\d)\s*-?\s*star/);
  if (starsMatch) {
    hotels.minStars = Number(starsMatch[1]);
    changed = true;
  }

  if (/\b(breakfast|bed and breakfast)\b/.test(normalized)) {
    hotels.board = "BB";
    changed = true;
  } else if (/\bhalf board\b/.test(normalized)) {
    hotels.board = "HB";
    changed = true;
  } else if (/\broom only\b/.test(normalized)) {
    hotels.board = "RO";
    changed = true;
  }

  return changed ? { hotels } : undefined;
}

export function applyTripModifications(
  message: string,
  base: TripSearchParams,
): TripSearchParams | null {
  const updated = structuredClone(base);
  let changed = false;
  const yearHint = base.flights.departureDate.slice(0, 4);

  const budget = parseBudget(message);
  if (budget) {
    updated.budget = budget;
    changed = true;
  }

  const dates = parseDates(message, yearHint);
  if (dates) {
    updated.flights.departureDate = dates.departureDate;
    updated.flights.returnDate = dates.returnDate;
    updated.hotels.checkIn = dates.departureDate;
    updated.hotels.checkOut = dates.returnDate;
    changed = true;
  }

  const passengers = parsePassengers(message);
  if (passengers) {
    updated.flights.passengers = passengers;
    syncHotelOccupancy(updated);
    changed = true;
  }

  const route = parseFromTo(message);
  if (route) {
    const origin = resolveCity(route.origin);
    const dest = resolveCity(route.destination);
    if (origin) {
      updated.flights.origin = origin.airport;
      changed = true;
    }
    if (dest) {
      updated.flights.destination = dest.airport;
      updated.hotels.destination = dest.name;
      updated.hotels.destinationCode = dest.hotel;
      changed = true;
    }
  }

  const flightPrefs = parseFlightPreferences(message);
  const hotelPrefs = parseHotelPreferences(message);
  if (flightPrefs || hotelPrefs) {
    updated.preferences = mergePreferences(updated.preferences, {
      ...flightPrefs,
      ...hotelPrefs,
    });
    if (updated.preferences?.flights?.stops === "direct") {
      updated.flights.nonStop = true;
    }
    changed = true;
  }

  return changed ? updated : null;
}
