import { parseFromTo } from "@/lib/utils/parse-from-to";
import type { TripSearchParams } from "@/lib/types/trip";

export type ChatIntent = "modify" | "new_search";

const NEW_TRIP_SIGNALS =
  /\b(new trip|start over|forget (that|this)|scratch that|plan something else|different trip)\b/i;

const MODIFY_SIGNALS =
  /\b(change|update|adjust|increase|decrease|raise|lower|make(?:\s+the)?\s+budget|make it|instead of|more people|fewer|extra|add|remove|looks good|increase budget|change dates|adjust budget)\b/i;

const MONTH_PATTERN =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

const BUDGET_PATTERN = /\b(?:budget|under|max)(?:\s+to)?\s*\$?\d[\d,]*(?:\.\d+)?\s*[kmb]?\b/i;

function routeDiffersFromContext(
  message: string,
  context: TripSearchParams,
): boolean {
  const route = parseFromTo(message);
  if (!route) return false;

  const origin = route.origin.toLowerCase();
  const dest = route.destination.toLowerCase();
  const ctxOrigin = context.flights.origin.toLowerCase();
  const ctxDest = context.hotels.destination.toLowerCase();
  const ctxDestCode = context.hotels.destinationCode.toLowerCase();

  const mentionsOrigin = origin.length >= 3;
  const mentionsDest = dest.length >= 3;
  if (!mentionsOrigin && !mentionsDest) return false;

  const originChanged =
    mentionsOrigin &&
    !ctxOrigin.includes(origin.slice(0, 3)) &&
    !origin.includes(ctxOrigin.slice(0, 3));
  const destChanged =
    mentionsDest &&
    !ctxDest.includes(dest.slice(0, 3)) &&
    !dest.includes(ctxDest.slice(0, 3)) &&
    !ctxDestCode.includes(dest.slice(0, 3));

  return originChanged || destChanged;
}

export function classifyChatIntent(
  message: string,
  context?: TripSearchParams | null,
): ChatIntent {
  if (!context) return "new_search";

  const trimmed = message.trim();
  if (!trimmed) return "modify";

  if (NEW_TRIP_SIGNALS.test(trimmed)) return "new_search";

  const route = parseFromTo(trimmed);
  if (route) {
    return routeDiffersFromContext(trimmed, context) ? "new_search" : "modify";
  }

  if (MODIFY_SIGNALS.test(trimmed)) return "modify";
  if (MONTH_PATTERN.test(trimmed) || BUDGET_PATTERN.test(trimmed)) return "modify";
  if (/^\$?\d[\d,]*k?$/i.test(trimmed)) return "modify";
  if (/family of \d+/i.test(trimmed)) return "modify";
  if (/\d+\s*(people|travell?ers?|adults?|kids?|children)/i.test(trimmed)) return "modify";
  if (/\b(direct|non-?stop|refundable|cheapest|fastest|one stop|\d\s*-?\s*star)\b/i.test(trimmed)) {
    return "modify";
  }

  // Short follow-ups without a full route usually refine the current trip.
  if (trimmed.length < 100) return "modify";

  return "new_search";
}
