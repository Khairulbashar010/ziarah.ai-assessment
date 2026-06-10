import type { TripSearchParams } from "@/lib/types/trip";
import { getAirportByCode, resolveAirportCode } from "@/lib/geo/airports";
import { resolveMetroCity } from "@/lib/geo/metro-cities";
import { nightsBetween } from "@/lib/utils/dates";
import { parseBudgetAmount } from "@/lib/utils/parse-budget-amount";
import { parseFromTo } from "@/lib/utils/parse-from-to";
import { totalPassengers } from "@/lib/utils/trip";
import { applyTripModifications } from "./apply-trip-modifications";
import { classifyChatIntent } from "./chat-intent";
import { tripSearchParamsSchema } from "./schemas";
import type { TripSearchStreamEvent } from "@/lib/trip-search/stream-events";

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

function parseMockQuery(query: string): TripSearchParams | null {
  const normalized = query.toLowerCase();
  const route = parseFromTo(query);
  if (!route) return null;

  const origin = resolveCity(route.origin);
  const dest = resolveCity(route.destination);
  if (!origin || !dest) return null;

  const familyMatch = normalized.match(/family of (\d+)/);
  const budgetMatch = normalized.match(/budget\s*\$?(\d[\d,]*(?:\.\d+)?)\s*([kmb])?/);
  const dateMatch = normalized.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/i,
  );

  const totalPax = familyMatch ? Number(familyMatch[1]) : 2;
  const adults = Math.max(1, Math.ceil(totalPax / 2));
  const children = Math.max(0, totalPax - adults);

  let departureDate = "2026-12-20";
  let returnDate = "2026-12-27";

  if (dateMatch) {
    const month = MONTHS[dateMatch[1].toLowerCase()];
    departureDate = `2026-${month}-${dateMatch[2].padStart(2, "0")}`;
    returnDate = `2026-${month}-${dateMatch[3].padStart(2, "0")}`;
  }

  const params: TripSearchParams = {
    flights: {
      origin: origin.airport,
      destination: dest.airport,
      departureDate,
      returnDate,
      passengers: { adults, children, infants: 0 },
      cabin: "ECONOMY",
    },
    hotels: {
      destination: dest.name,
      destinationCode: dest.hotel,
      checkIn: departureDate,
      checkOut: returnDate,
      occupancies: [
        {
          rooms: 1,
          adults,
          children,
          childAges: children > 0 ? Array.from({ length: children }, (_, i) => 8 + i) : undefined,
        },
      ],
    },
    tripType: "ROUND_TRIP",
  };

  if (budgetMatch) {
    const maxTotal = parseBudgetAmount(budgetMatch[1], budgetMatch[2]);
    if (maxTotal !== undefined) {
      params.budget = { maxTotal, currency: "USD" };
    }
  }

  return params;
}

function tryFastParse(query: string): TripSearchParams | null {
  const parsed = parseMockQuery(query);
  return parsed ? tripSearchParamsSchema.parse(parsed) : null;
}

function tryContextualParse(
  query: string,
  context?: TripSearchParams | null,
): TripSearchParams | null {
  if (!context) return null;

  const intent = classifyChatIntent(query, context);
  if (intent === "modify") {
    const modified = applyTripModifications(query, context);
    if (modified) return tripSearchParamsSchema.parse(modified);
  }

  return null;
}

/** LLM is preferred unless MOCK_LLM=true (CI/deterministic mode). */
function shouldUseLlmFirst(): boolean {
  if (process.env.MOCK_LLM === "true") return false;
  return Boolean(process.env.OPENAI_API_KEY);
}

function llmModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

async function tryLlmParse(
  query: string,
  context?: TripSearchParams | null,
): Promise<TripSearchParams | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const { parseTripQueryWithOpenAI } = await import("./openai-parse");
  try {
    return await parseTripQueryWithOpenAI(query, apiKey, llmModel(), context);
  } catch {
    return null;
  }
}

function tryFastParsePaths(
  query: string,
  context?: TripSearchParams | null,
): TripSearchParams | null {
  return tryContextualParse(query, context) ?? tryFastParse(query);
}

export async function parseTripQuery(
  query: string,
  context?: TripSearchParams | null,
): Promise<TripSearchParams> {
  if (shouldUseLlmFirst()) {
    const llm = await tryLlmParse(query, context);
    if (llm) return llm;
  }

  const fast = tryFastParsePaths(query, context);
  if (fast) return fast;

  throw new Error(
    shouldUseLlmFirst()
      ? "Could not parse query"
      : "Could not parse query and OPENAI_API_KEY is not set",
  );
}

export async function* streamParseTripQuery(
  query: string,
  context?: TripSearchParams | null,
): AsyncGenerator<TripSearchStreamEvent> {
  const intent = context ? classifyChatIntent(query, context) : null;
  yield {
    type: "status",
    message:
      intent === "modify"
        ? "Updating your trip details..."
        : intent === "new_search"
          ? "Planning a new trip..."
          : "Understanding your trip...",
    progress: 10,
  };

  if (shouldUseLlmFirst()) {
    yield {
      type: "status",
      message: "Extracting dates, route, and travelers...",
      progress: 15,
    };

    const llm = await tryLlmParse(query, context);
    if (llm) {
      yield { type: "parsed", params: llm };
      return;
    }
  }

  const fast = tryFastParsePaths(query, context);
  if (fast) {
    yield { type: "parsed", params: fast };
    return;
  }

  throw new Error(
    shouldUseLlmFirst()
      ? "Could not parse query"
      : "Could not parse query and OPENAI_API_KEY is not set",
  );
}

export function formatParsedSummary(params: TripSearchParams): string {
  const { flights } = params;
  const nights = nightsBetween(params.hotels.checkIn, params.hotels.checkOut);
  const pax = totalPassengers(flights.passengers);
  const childPart =
    flights.passengers.children > 0
      ? `, ${flights.passengers.children} ${flights.passengers.children === 1 ? "child" : "children"}`
      : "";
  return `✈️ ${flights.origin} → ${params.hotels.destination} · ${flights.passengers.adults} adults${childPart} · ${nights} nights · ${pax} travelers`;
}
