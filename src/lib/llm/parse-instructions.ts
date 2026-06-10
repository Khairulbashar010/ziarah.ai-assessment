import type { TripSearchParams } from "@/lib/types/trip";

/** Compact system prompt — strict JSON schema enforces shape; Zod validates after. */
export const TRIP_PARSE_SYSTEM_PROMPT = `Extract TripSearchParams JSON from the user message. JSON only, no prose.

ALWAYS include (use defaults when unstated):
- flights.origin, flights.destination — IATA/metro uppercase (London=LON, Dubai=DXB, Paris=PAR, NYC, TYO, ROM).
- flights.departureDate — year omitted → next future occurrence.
- flights.returnDate — required for ROUND_TRIP; null for ONE_WAY.
- flights.passengers — default { adults: 2, children: 0, infants: 0 }; "family of N"/"N people" → 2 adults + (N−2) children.
- flights.cabin — default ECONOMY.
- tripType — default ROUND_TRIP; ONE_WAY only when explicitly stated.
- hotels.destination, hotels.destinationCode — match flight destination.
- hotels.checkIn, hotels.checkOut — default to flight departure/return dates.
- hotels.occupancies — 1 room; adults/children mirror flights.passengers; childAges only when children > 0 (infer e.g. [8, 10] if ages unstated).

ONLY when explicitly stated (otherwise omit or null):
- budget — set only when user mentions budget/under/max/spend. Scale: k/K=×1000, m/M=×1e6, b/B=×1e9. "to/at $N"→maxTotal; "by $N"/"add N"→add; "decrease by N"→subtract. Currency default USD.
- flights.passengers.infants — only when infants/babies/lap child mentioned.
- flights.cabin — PREMIUM_ECONOMY, BUSINESS, or FIRST only when user names a cabin/class.
- flights.nonStop — true only for explicit non-stop/direct/no-stops; also set true when preferences.flights.stops is "direct". Otherwise null.
- preferences — omit entirely unless stated; never default. Sub-keys:
  - flights.stops: explicit stop constraint (direct, one stop, 2+)
  - flights.sort: cheapest/fastest/earliest when user asks to sort
  - flights.refundableOnly: refundable/flexible tickets
  - flights.airlines: named carrier (Emirates=EK, British Airways=BA, etc.)
  - hotels.sort: cheapest/best-rated when user asks to sort
  - hotels.minStars: star rating stated ("4 star"→4)
  - hotels.board: meal plan stated (RO=room only, BB=breakfast, HB=half board)

Do not invent offers or add fields outside the schema.

Context: if refining the current trip (same route, adjust dates/budget/travelers), merge the change and carry forward unchanged fields. If destination/route changes, extract fresh params.`;


export function buildContextualUserMessage(
  query: string,
  context?: TripSearchParams | null,
): string {
  if (!context) return query;
  return `Previous trip context:\n${JSON.stringify(context)}\n\nUser message:\n${query}`;
}
