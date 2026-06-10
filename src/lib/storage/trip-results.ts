import type { TripSearchResult } from "@/lib/types/trip";

const store = new Map<string, TripSearchResult>();

export function saveTripResult(result: TripSearchResult) {
  store.set(result.requestId, result);
}

export function getTripResult(requestId: string): TripSearchResult | undefined {
  return store.get(requestId);
}
