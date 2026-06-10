export type PassengerCount = {
  adults: number;
  children: number;
  infants: number;
};

export type FlightSearchParams = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: PassengerCount;
  cabin: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";
  /** Passed to Sabre/Amadeus when user wants non-stop only. */
  nonStop?: boolean;
};

export type HotelOccupancy = {
  rooms: number;
  adults: number;
  children: number;
  childAges?: number[];
};

export type HotelSearchParams = {
  destination: string;
  destinationCode: string;
  checkIn: string;
  checkOut: string;
  occupancies: HotelOccupancy[];
};

export type BudgetParams = {
  maxTotal: number;
  currency: string;
};

/** Client-side flight filters extractable from natural language. */
export type FlightSearchPreferences = {
  stops?: "any" | "direct" | "1" | "2plus";
  sort?: "best" | "price" | "duration" | "departure";
  refundableOnly?: boolean;
  /** IATA 2-letter carrier codes, e.g. EK, BA. */
  airlines?: string[];
};

/** Client-side hotel filters extractable from natural language. */
export type HotelSearchPreferences = {
  sort?: "best" | "price" | "rating";
  minStars?: number;
  board?: "RO" | "BB" | "HB";
};

export type TripSearchPreferences = {
  flights?: FlightSearchPreferences;
  hotels?: HotelSearchPreferences;
};

export type TripSearchParams = {
  flights: FlightSearchParams;
  hotels: HotelSearchParams;
  budget?: BudgetParams;
  tripType: "ONE_WAY" | "ROUND_TRIP";
  preferences?: TripSearchPreferences;
};

export type FlightSegment = {
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  carrier: string;
  flightNumber: string;
};

export type UnifiedFlightOffer = {
  id: string;
  provider: "sabre" | "amadeus";
  totalPrice: number;
  currency: string;
  perPassenger: number;
  validatingCarrier: string;
  stops: number;
  durationMinutes: number;
  segments: FlightSegment[];
  refundable: boolean;
  raw: unknown;
};

export type UnifiedHotelOffer = {
  id: string;
  provider: "hotelbeds";
  hotelCode: number;
  hotelName: string;
  destinationCode: string;
  category: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomName: string;
  boardName: string;
  totalPrice: number;
  currency: string;
  rateType: "BOOKABLE" | "RECHECK";
  cancellationPolicies: { amount: string; from: string }[];
  raw: unknown;
};

export type ProviderStatus = {
  domain: "flights" | "hotels";
  status: "success" | "error" | "timeout" | "pending";
  offerCount: number;
  durationMs: number;
  error?: string;
};

/** Client-safe flight offer — no provider raw payload. */
export type PublicFlightOffer = Omit<UnifiedFlightOffer, "raw">;

/** Client-safe hotel offer — no provider raw payload. */
export type PublicHotelOffer = Omit<UnifiedHotelOffer, "raw">;

/** One leg of a split hotel stay within a trip. */
export type HotelStaySegment = {
  id: string;
  offerId: string;
  nights: number;
  checkIn: string;
  checkOut: string;
};

export type TripSummary = {
  cheapestFlight: number | null;
  cheapestHotel: number | null;
  estimatedTripTotal: number | null;
  currency: string;
  withinBudget: boolean | null;
  budgetRemaining: number | null;
  /** Cheapest unfiltered combo when budget filtering removes all options. */
  suggestedMinBudget: number | null;
};

export type TripSearchCacheMeta = {
  /** How this response was produced relative to the query cache. */
  status: "fresh" | "stale" | "miss" | "refreshing";
  /** ISO timestamp when provider data was last fetched for this query. */
  cachedAt: string | null;
  /** ISO timestamp when cached data expires (fixed window — not extended on cache hits). */
  expiresAt: string | null;
  /** Milliseconds until expiresAt; 0 when stale or actively refreshing. */
  refreshInMs: number | null;
  /** Configured cache window for this search shape. */
  ttlMs: number;
};

export type TripSearchMeta = {
  durationMs: number;
  providersQueried: number;
  providersSucceeded: number;
  providersFailed: number;
  partialResults: boolean;
  cache: TripSearchCacheMeta;
};

/** Full server-side search result — retains provider raw payloads for booking/replay. */
export type TripSearchResult = {
  requestId: string;
  parsedQuery: TripSearchParams;
  meta: TripSearchMeta;
  providers: {
    sabre: ProviderStatus;
    amadeus: ProviderStatus;
    hotelbeds: ProviderStatus;
  };
  flights: {
    totalOffers: number;
    withinBudget: boolean;
    offers: UnifiedFlightOffer[];
  };
  hotels: {
    totalOffers: number;
    offers: UnifiedHotelOffer[];
  };
  tripSummary: TripSummary;
};

/** API / SSE payload — capped, ranked top offers without raw provider data. */
export type TripSearchResponse = {
  requestId: string;
  parsedQuery: TripSearchParams;
  meta: TripSearchMeta;
  providers: TripSearchResult["providers"];
  flights: {
    /** Total ranked offers before client cap. */
    totalOffers: number;
    /** True when totalOffers exceeds the returned page size. */
    truncated: boolean;
    withinBudget: boolean;
    offers: PublicFlightOffer[];
  };
  hotels: {
    totalOffers: number;
    truncated: boolean;
    offers: PublicHotelOffer[];
  };
  tripSummary: TripSummary;
};

/** Lightweight stream chunk — omits parsedQuery/requestId to avoid redundant bytes. */
export type TripOffersUpdate = {
  meta: TripSearchMeta;
  providers: TripSearchResult["providers"];
  flights: TripSearchResponse["flights"];
  hotels: TripSearchResponse["hotels"];
  tripSummary: TripSummary;
};
