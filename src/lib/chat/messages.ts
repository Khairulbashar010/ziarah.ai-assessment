import type { TripSearchParams, TripSearchResponse } from "@/lib/types/trip";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  params?: TripSearchParams;
  result?: Pick<TripSearchResponse, "flights" | "tripSummary">;
};

export function buildAssistantReply(
  params: TripSearchParams,
  result: TripSearchResponse | null,
  userMessage: string,
): string {
  const normalized = userMessage.trim().toLowerCase();
  if (/^looks good$/i.test(normalized)) {
    return "Great — your trip details look set. Pick a flight from the list on the right when you're ready.";
  }

  const offerCount = result?.flights.offers.length ?? 0;
  const cheapest = result?.tripSummary.cheapestFlight;
  const budget = params.budget;

  if (budget && offerCount === 0 && result?.tripSummary.suggestedMinBudget) {
    return `Updated your trip. Nothing fits the $${budget.maxTotal.toLocaleString()} budget — the cheapest option starts at $${result.tripSummary.suggestedMinBudget.toLocaleString()}. Want to raise the budget?`;
  }

  if (budget && offerCount > 0 && cheapest != null) {
    return `Updated your trip. Found ${offerCount} flight${offerCount !== 1 ? "s" : ""} within your $${budget.maxTotal.toLocaleString()} budget, starting at $${cheapest.toLocaleString()}.`;
  }

  if (offerCount > 0 && cheapest != null) {
    return `Updated your trip. Found ${offerCount} flight option${offerCount !== 1 ? "s" : ""} starting at $${cheapest.toLocaleString()}.`;
  }

  return "Updated your trip details. Searching for the best options now.";
}
