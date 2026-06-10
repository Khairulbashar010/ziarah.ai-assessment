import type { ProviderStatus, TripSearchParams, TripSearchResponse, TripOffersUpdate } from "@/lib/types/trip";

export type TripSearchStreamEvent =
  | { type: "status"; message: string; progress?: number }
  | { type: "parse_delta"; text: string }
  | { type: "parsed"; params: TripSearchParams }
  | { type: "provider"; provider: "sabre" | "amadeus" | "hotelbeds"; status: ProviderStatus }
  | { type: "offers_update"; update: TripOffersUpdate }
  | { type: "complete"; result: TripSearchResponse }
  | { type: "error"; message: string; status?: number };
