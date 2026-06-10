import { v4 as uuidv4 } from "uuid";
import type {
  ProviderStatus,
  TripSearchParams,
  TripSearchResult,
  TripSummary,
  UnifiedFlightOffer,
  UnifiedHotelOffer,
} from "@/lib/types/trip";
import { toClientOffersUpdate, toClientTripResponse } from "@/lib/trip-search/client-payload";
import {
  attachCacheMeta,
  buildCacheMeta,
  lookupTripSearchCache,
  materializeCachedResult,
  runWithRefreshLock,
  saveTripSearchCache,
} from "@/lib/storage/trip-query-cache";
import { saveTripResult } from "@/lib/storage/trip-results";
import { parseTripQuery, streamParseTripQuery } from "@/lib/llm/parse-trip-query";
import { searchSabreFlights } from "@/lib/providers/sabre/client";
import { searchAmadeusFlights } from "@/lib/providers/amadeus/client";
import { searchHotelBedsHotels } from "@/lib/providers/hotelbeds/client";
import { normalizeSabreFlights } from "@/lib/normalization/sabre";
import { normalizeAmadeusFlights } from "@/lib/normalization/amadeus";
import { normalizeHotelBedsHotels } from "@/lib/normalization/hotelbeds";
import { withTimeout, TimeoutError } from "@/lib/resilience/with-timeout";
import { minPrice, roundMoney } from "@/lib/utils/money";
import type { TripSearchStreamEvent } from "@/lib/trip-search/stream-events";
import {
  filterOffersByBudget,
  minComboPrice,
} from "@/lib/orchestration/budget-filter";
import { toProviderFanOutPayload } from "@/lib/llm/provider-payloads";
import { rankFlightOffers, rankHotelOffers } from "@/lib/trip-search/rank-offers";

const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS ?? 2500);

type ProviderName = "sabre" | "amadeus" | "hotelbeds";

const PROVIDER_DOMAINS: Record<ProviderName, ProviderStatus["domain"]> = {
  sabre: "flights",
  amadeus: "flights",
  hotelbeds: "hotels",
};

type ProviderRunResult = {
  name: ProviderName;
  status: ProviderStatus;
  flights: UnifiedFlightOffer[];
  hotels: UnifiedHotelOffer[];
};

async function runProvider(
  name: ProviderName,
  domain: ProviderStatus["domain"],
  fn: () => Promise<unknown>,
  normalize: (raw: unknown) => UnifiedFlightOffer[] | UnifiedHotelOffer[],
): Promise<ProviderRunResult> {
  const start = Date.now();

  try {
    const raw = await withTimeout(fn(), PROVIDER_TIMEOUT_MS, name);
    const offers = normalize(raw);

    return {
      name,
      status: {
        domain,
        status: "success",
        offerCount: offers.length,
        durationMs: Date.now() - start,
      },
      flights: domain === "flights" ? (offers as UnifiedFlightOffer[]) : [],
      hotels: domain === "hotels" ? (offers as UnifiedHotelOffer[]) : [],
    };
  } catch (error) {
    return {
      name,
      status: {
        domain,
        status: error instanceof TimeoutError ? "timeout" : "error",
        offerCount: 0,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      flights: [],
      hotels: [],
    };
  }
}

function buildTripSummary(
  flights: UnifiedFlightOffer[],
  hotels: UnifiedHotelOffer[],
  budget?: TripSearchParams["budget"],
): TripSummary {
  const cheapestFlight = minPrice(flights);
  const cheapestHotel = minPrice(hotels);
  const currency = budget?.currency ?? flights[0]?.currency ?? hotels[0]?.currency ?? "USD";

  const estimatedTripTotal =
    cheapestFlight !== null && cheapestHotel !== null
      ? roundMoney(cheapestFlight + cheapestHotel)
      : null;

  let withinBudget: boolean | null = null;
  let budgetRemaining: number | null = null;

  if (budget && estimatedTripTotal !== null) {
    withinBudget = estimatedTripTotal <= budget.maxTotal;
    budgetRemaining = roundMoney(budget.maxTotal - estimatedTripTotal);
  }

  return {
    cheapestFlight,
    cheapestHotel,
    estimatedTripTotal,
    currency,
    withinBudget,
    budgetRemaining,
    suggestedMinBudget: null,
  };
}

export type QuorumFailureDetails = {
  requestId: string;
  providersSucceeded: number;
  providersRequired: number;
  providerTimeoutMs: number;
  route: string;
  providers: TripSearchResult["providers"];
};

export class QuorumError extends Error {
  readonly details: QuorumFailureDetails;

  constructor(details: QuorumFailureDetails, message = "Fewer than 2 of 3 providers succeeded") {
    super(message);
    this.name = "QuorumError";
    this.details = details;
  }
}

function logQuorumFailure(details: QuorumFailureDetails) {
  const failed = Object.entries(details.providers)
    .filter(([, status]) => status.status !== "success")
    .map(([name, status]) => ({
      name,
      status: status.status,
      error: status.error,
      durationMs: status.durationMs,
    }));

  console.error("[trip-search] quorum not met", {
    requestId: details.requestId,
    route: details.route,
    providersSucceeded: details.providersSucceeded,
    providersRequired: details.providersRequired,
    providerTimeoutMs: details.providerTimeoutMs,
    failedProviders: failed,
    providers: details.providers,
  });
}

export async function searchTrip(
  query: string,
  requestId = uuidv4(),
  context?: TripSearchParams | null,
): Promise<TripSearchResult> {
  const started = Date.now();
  const parsedQuery = await parseTripQuery(query, context);
  return executeTripSearch(parsedQuery, requestId, started);
}

async function refreshTripSearchCache(parsedQuery: TripSearchParams): Promise<TripSearchResult | null> {
  try {
    return await finalizeTripSearch(parsedQuery, uuidv4(), Date.now());
  } catch (error) {
    console.error("[trip-search] cache refresh failed", error);
    return null;
  }
}

async function executeTripSearch(
  parsedQuery: TripSearchParams,
  requestId: string,
  started: number,
): Promise<TripSearchResult> {
  const lookup = lookupTripSearchCache(parsedQuery);

  if (lookup.status === "fresh" && lookup.entry) {
    const cached = materializeCachedResult(lookup.entry, requestId, started, "fresh");
    saveTripResult(cached);
    return cached;
  }

  if (lookup.status === "stale" && lookup.entry) {
    void runWithRefreshLock(lookup.entry.cacheKey, async () => {
      const refreshed = await refreshTripSearchCache(parsedQuery);
      if (refreshed) {
        saveTripSearchCache(parsedQuery, refreshed);
      }
      return refreshed;
    });

    const cached = materializeCachedResult(lookup.entry, requestId, started, "stale");
    saveTripResult(cached);
    return cached;
  }

  const result = await finalizeTripSearch(parsedQuery, requestId, started);
  saveTripSearchCache(parsedQuery, result);
  saveTripResult(result);

  const entry = lookupTripSearchCache(parsedQuery).entry;
  return attachCacheMeta(result, "miss", entry);
}

async function finalizeTripSearch(
  parsedQuery: TripSearchParams,
  requestId: string,
  started: number,
): Promise<TripSearchResult> {
  const providers = toProviderFanOutPayload(parsedQuery);

  const [sabreResult, amadeusResult, hotelbedsResult] = await Promise.all([
    runProvider("sabre", "flights", () => searchSabreFlights(providers.sabre), normalizeSabreFlights),
    runProvider("amadeus", "flights", () => searchAmadeusFlights(providers.amadeus), normalizeAmadeusFlights),
    runProvider(
      "hotelbeds",
      "hotels",
      () => searchHotelBedsHotels(providers.hotelbeds),
      (raw) =>
        normalizeHotelBedsHotels(raw, providers.hotelbeds.checkIn, providers.hotelbeds.checkOut),
    ),
  ]);

  return assembleTripResponse(parsedQuery, requestId, started, [
    sabreResult,
    amadeusResult,
    hotelbedsResult,
  ]);
}

function pendingProviderStatus(name: ProviderName): ProviderStatus {
  return {
    domain: PROVIDER_DOMAINS[name],
    status: "pending",
    offerCount: 0,
    durationMs: 0,
  };
}

function buildProviderStatusMap(
  results: ProviderRunResult[],
): TripSearchResult["providers"] {
  const byName = Object.fromEntries(results.map((r) => [r.name, r.status])) as Partial<
    Record<ProviderName, ProviderStatus>
  >;

  return {
    sabre: byName.sabre ?? pendingProviderStatus("sabre"),
    amadeus: byName.amadeus ?? pendingProviderStatus("amadeus"),
    hotelbeds: byName.hotelbeds ?? pendingProviderStatus("hotelbeds"),
  };
}

function mergeRankedOffers(
  results: ProviderRunResult[],
  parsedQuery: TripSearchParams,
): {
  flightOffers: UnifiedFlightOffer[];
  hotelOffers: UnifiedHotelOffer[];
  suggestedMinBudget: number | null;
  tripSummary: TripSummary;
} {
  let flightOffers = rankFlightOffers(results.flatMap((r) => r.flights));
  let hotelOffers = rankHotelOffers(results.flatMap((r) => r.hotels));

  let suggestedMinBudget: number | null = null;

  if (parsedQuery.budget) {
    const unfilteredFlights = flightOffers;
    const unfilteredHotels = hotelOffers;
    const filtered = filterOffersByBudget(
      flightOffers,
      hotelOffers,
      parsedQuery.budget.maxTotal,
    );
    flightOffers = filtered.flights;
    hotelOffers = filtered.hotels;

    if (flightOffers.length === 0 || hotelOffers.length === 0) {
      suggestedMinBudget = minComboPrice(unfilteredFlights, unfilteredHotels);
    }
  }

  const tripSummary = buildTripSummary(flightOffers, hotelOffers, parsedQuery.budget);
  if (suggestedMinBudget !== null) {
    tripSummary.suggestedMinBudget = suggestedMinBudget;
  }

  return { flightOffers, hotelOffers, suggestedMinBudget, tripSummary };
}

function buildTripSnapshot(
  parsedQuery: TripSearchParams,
  requestId: string,
  started: number,
  results: ProviderRunResult[],
  complete: boolean,
): TripSearchResult {
  const succeeded = results.filter((r) => r.status.status === "success").length;
  const providersFailed = results.filter((r) => r.status.status !== "success").length;
  const pendingCount = 3 - results.length;
  const { flightOffers, hotelOffers, tripSummary } = mergeRankedOffers(results, parsedQuery);

  return {
    requestId,
    parsedQuery,
    meta: {
      durationMs: Date.now() - started,
      providersQueried: 3,
      providersSucceeded: succeeded,
      providersFailed: providersFailed + pendingCount,
      partialResults: !complete || pendingCount > 0 || providersFailed > 0,
      cache: buildCacheMeta("miss", null),
    },
    providers: buildProviderStatusMap(results),
    flights: {
      totalOffers: flightOffers.length,
      withinBudget: tripSummary.withinBudget ?? true,
      offers: flightOffers,
    },
    hotels: {
      totalOffers: hotelOffers.length,
      offers: hotelOffers,
    },
    tripSummary,
  };
}

function assembleTripResponse(
  parsedQuery: TripSearchParams,
  requestId: string,
  started: number,
  results: ProviderRunResult[],
): TripSearchResult {
  const succeeded = results.filter((r) => r.status.status === "success").length;

  if (succeeded < 2) {
    const details: QuorumFailureDetails = {
      requestId,
      providersSucceeded: succeeded,
      providersRequired: 2,
      providerTimeoutMs: PROVIDER_TIMEOUT_MS,
      route: `${parsedQuery.flights.origin} → ${parsedQuery.flights.destination}`,
      providers: buildProviderStatusMap(results),
    };
    logQuorumFailure(details);
    throw new QuorumError(details);
  }

  return buildTripSnapshot(parsedQuery, requestId, started, results, true);
}

export async function* searchTripStream(
  query: string,
  requestId = uuidv4(),
  context?: TripSearchParams | null,
): AsyncGenerator<TripSearchStreamEvent> {
  const started = Date.now();
  let parsedQuery: TripSearchParams | null = null;

  for await (const event of streamParseTripQuery(query, context)) {
    yield event;
    if (event.type === "parsed") {
      parsedQuery = event.params;
    }
  }

  if (!parsedQuery) {
    throw new Error("Could not parse travel query");
  }

  const cacheLookup = lookupTripSearchCache(parsedQuery);

  if (cacheLookup.status === "fresh" && cacheLookup.entry) {
    const cached = materializeCachedResult(cacheLookup.entry, requestId, started, "fresh");
    saveTripResult(cached);

    yield {
      type: "status",
      message: "Serving cached results...",
      progress: 90,
    };
    yield { type: "offers_update", update: toClientOffersUpdate(cached) };
    yield { type: "status", message: "Your trip is ready!", progress: 100 };
    yield { type: "complete", result: toClientTripResponse(cached) };
    return;
  }

  if (cacheLookup.status === "stale" && cacheLookup.entry) {
    const cached = materializeCachedResult(cacheLookup.entry, requestId, started, "stale");
    saveTripResult(cached);

    yield {
      type: "status",
      message: "Showing cached prices — refreshing shortly...",
      progress: 40,
    };
    yield { type: "offers_update", update: toClientOffersUpdate(cached) };
    yield { type: "complete", result: toClientTripResponse(cached) };

    const refreshed = await runWithRefreshLock(cacheLookup.entry.cacheKey, async () => {
      const result = await refreshTripSearchCache(parsedQuery);
      if (result) {
        saveTripSearchCache(parsedQuery, result);
      }
      return result;
    });

    if (refreshed) {
      const entry = lookupTripSearchCache(parsedQuery).entry;
      const updated = attachCacheMeta({ ...refreshed, requestId }, "fresh", entry);
      saveTripResult(updated);

      yield { type: "status", message: "Prices updated", progress: 95 };
      yield { type: "offers_update", update: toClientOffersUpdate(updated) };
      yield { type: "complete", result: toClientTripResponse(updated) };
    }

    return;
  }

  const providers = toProviderFanOutPayload(parsedQuery);

  yield {
    type: "status",
    message: "Searching our flight and hotel inventory...",
    progress: 35,
  };

  const providerJobs: Array<{
    name: ProviderName;
    promise: Promise<ProviderRunResult>;
  }> = [
    {
      name: "sabre",
      promise: runProvider(
        "sabre",
        "flights",
        () => searchSabreFlights(providers.sabre),
        normalizeSabreFlights,
      ),
    },
    {
      name: "amadeus",
      promise: runProvider(
        "amadeus",
        "flights",
        () => searchAmadeusFlights(providers.amadeus),
        normalizeAmadeusFlights,
      ),
    },
    {
      name: "hotelbeds",
      promise: runProvider(
        "hotelbeds",
        "hotels",
        () => searchHotelBedsHotels(providers.hotelbeds),
        (raw) =>
          normalizeHotelBedsHotels(
            raw,
            providers.hotelbeds.checkIn,
            providers.hotelbeds.checkOut,
          ),
      ),
    },
  ];

  const pending = new Map(
    providerJobs.map(({ name, promise }) => [name, promise] as const),
  );

  const providerResults: ProviderRunResult[] = [];
  let completedProviders = 0;

  while (pending.size > 0) {
    const entries = [...pending.entries()];
    const finished = await Promise.race(
      entries.map(async ([name, promise]) => ({
        name,
        result: await promise,
      })),
    );

    pending.delete(finished.name);
    providerResults.push(finished.result);
    completedProviders += 1;

    yield {
      type: "provider",
      provider: finished.name,
      status: finished.result.status,
    };

    const partial = buildTripSnapshot(
      parsedQuery,
      requestId,
      started,
      providerResults,
      false,
    );
    yield { type: "offers_update", update: toClientOffersUpdate(partial) };

    yield {
      type: "status",
      message:
        completedProviders === 3
          ? "Building your itinerary..."
          : "Still searching our inventory...",
      progress: 35 + Math.round((completedProviders / 3) * 55),
    };
  }

  const result = assembleTripResponse(parsedQuery, requestId, started, providerResults);
  saveTripSearchCache(parsedQuery, result);

  const entry = lookupTripSearchCache(parsedQuery).entry;
  const withCache = attachCacheMeta(result, "miss", entry);
  saveTripResult(withCache);

  yield { type: "status", message: "Your trip is ready!", progress: 100 };
  yield { type: "complete", result: toClientTripResponse(withCache) };
}
