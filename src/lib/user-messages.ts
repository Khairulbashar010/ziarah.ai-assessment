const TECHNICAL_MARKERS =
  /\b(api key|openai|sabre|amadeus|hotelbeds|quorum|provider|circuit breaker|internal server|streaming|mock_|status\s*\d{3}|timed out after \d+ms)\b/i;

export const USER_ERRORS = {
  quorum:
    "We couldn't pull together enough flight and hotel options right now. Please try again in a moment.",
  parse:
    "I couldn't quite understand that trip. Try mentioning where you're going, when you're travelling, and how many people.",
  timeout: "This is taking longer than expected. Please try your search again.",
  notFound: "We couldn't find that trip. Head back home and start a new search.",
  generic: "Something went wrong. Please try again.",
  emptyQuery: "Tell us where you'd like to go and we'll help plan your trip.",
} as const;

export const USER_SUCCESS = {
  tripReady: "Your trip options are ready!",
  tripUpdated: "Your trip has been updated.",
  pricesRefreshed: "Prices have been refreshed.",
} as const;

function looksTechnical(message: string): boolean {
  return (
    TECHNICAL_MARKERS.test(message) ||
    /\(\d{3}\)/.test(message) ||
    message.includes("→") ||
    message.includes("OPENAI_")
  );
}

export function toUserErrorMessage(raw: unknown, status?: number): string {
  const message =
    typeof raw === "string"
      ? raw
      : raw instanceof Error
        ? raw.message
        : "";

  const lower = message.toLowerCase();

  if (status === 404 || lower.includes("trip not found")) {
    return USER_ERRORS.notFound;
  }
  if (
    status === 422 ||
    lower.includes("could not parse") ||
    lower.includes("could not understand") ||
    lower.includes("invalid request")
  ) {
    return USER_ERRORS.parse;
  }
  if (
    status === 503 ||
    lower.includes("fewer than 2") ||
    lower.includes("quorum")
  ) {
    return USER_ERRORS.quorum;
  }
  if (
    status === 504 ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("global timed out")
  ) {
    return USER_ERRORS.timeout;
  }
  if (status === 400) {
    return USER_ERRORS.parse;
  }
  if (
    lower.includes("streaming response") ||
    lower.includes("internal server") ||
    lower.includes("search failed") ||
    looksTechnical(message)
  ) {
    return USER_ERRORS.generic;
  }

  if (message && !looksTechnical(message)) {
    return message;
  }

  return USER_ERRORS.generic;
}

const STATUS_MESSAGE_MAP: Record<string, string> = {
  "Serving cached results...": "Loading your recent options...",
  "Showing cached prices — refreshing shortly...":
    "Showing recent prices — we'll refresh them shortly...",
  "Searching our flight and hotel inventory...": "Searching flights and hotels...",
  "Still searching our inventory...": "Still searching for the best options...",
  "Extracting dates, route, and travelers...":
    "Reading your dates, route, and travellers...",
  "Searching flight inventory...": "Searching for flights...",
  "Flight options matched to your trip": "Found flights that match your trip",
  "Hotel stays matched to your trip": "Found hotels that match your trip",
};

export function toUserStatusMessage(message: string): string {
  return STATUS_MESSAGE_MAP[message] ?? message;
}
