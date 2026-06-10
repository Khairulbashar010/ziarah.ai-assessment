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
import {
  logCacheRefreshFailure,
  logProviderQuorumRetry,
  logProviderResult,
  logQuorumFailure,
  requestLogger,
} from "@/lib/observability/logger";
import { API_ROUTES } from "@/lib/observability/api-routes";
import { recordCacheLookup, recordProviderResult, recordQuorumFailure } from "@/lib/observability/metrics";
import { withSpan } from "@/lib/observability/tracing";
import type { ProviderFanOutPayload } from "@/lib/llm/provider-payloads";

const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS ?? 2500);
const PROVIDER_RETRY_TIMEOUT_MS = Number(process.env.PROVIDER_RETRY_TIMEOUT_MS ?? 1000);
const QUORUM_REQUIRED = 2;

function isProviderQuorumRetryEnabled(): boolean {
  return process.env.PROVIDER_QUORUM_RETRY !== "false";
}

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

type ProviderJobSpec = {
  name: ProviderName;
  domain: ProviderStatus["domain"];
  fn: () => Promise<unknown>;
  normalize: (raw: unknown) => UnifiedFlightOffer[] | UnifiedHotelOffer[];
};

function buildProviderJobSpecs(providers: ProviderFanOutPayload): ProviderJobSpec[] {
  return [
    {
      name: "sabre",
      domain: "flights",
      fn: () => searchSabreFlights(providers.sabre),
      normalize: normalizeSabreFlights,
    },
    {
      name: "amadeus",
      domain: "flights",
      fn: () => searchAmadeusFlights(providers.amadeus),
      normalize: normalizeAmadeusFlights,
    },
    {
      name: "hotelbeds",
      domain: "hotels",
      fn: () => searchHotelBedsHotels(providers.hotelbeds),
      normalize: (raw) =>
        normalizeHotelBedsHotels(raw, providers.hotelbeds.checkIn, providers.hotelbeds.checkOut),
    },
  ];
}

async function runProvider(
  name: ProviderName,
  domain: ProviderStatus["domain"],
  fn: () => Promise<unknown>,
  normalize: (raw: unknown) => UnifiedFlightOffer[] | UnifiedHotelOffer[],
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<ProviderRunResult> {
  return withSpan(`provider.${name}`, async () => {
    const start = Date.now();

    try {
      const raw = await withTimeout(fn(), timeoutMs, name);
      const offers = await withSpan(`normalize.${name}`, async () => normalize(raw));

      const result: ProviderRunResult = {
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

      recordProviderResult({
        provider: name,
        status: "success",
        durationMs: result.status.durationMs,
      });

      return result;
    } catch (error) {
      const status = error instanceof TimeoutError ? "timeout" : "error";
      const durationMs = Date.now() - start;

      recordProviderResult({ provider: name, status, durationMs });

      return {
        name,
        status: {
          domain,
          status,
          offerCount: 0,
          durationMs,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        flights: [],
        hotels: [],
      };
    }
  }, { provider: name, domain });
}

function countSucceededProviders(results: ProviderRunResult[]): number {
  return results.filter((result) => result.status.status === "success").length;
}

async function fanOutProviders(
  specs: ProviderJobSpec[],
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<ProviderRunResult[]> {
  return withSpan("provider.fanout", async () =>
    Promise.all(
      specs.map((spec) =>
        runProvider(spec.name, spec.domain, spec.fn, spec.normalize, timeoutMs),
      ),
    ),
  );
}

type QuorumRetryOutcome = {
  results: ProviderRunResult[];
  retried: ProviderRunResult[];
};

async function maybeRetryFailedProvidersForQuorum(
  results: ProviderRunResult[],
  specs: ProviderJobSpec[],
  requestId: string,
): Promise<QuorumRetryOutcome> {
  if (!isProviderQuorumRetryEnabled() || countSucceededProviders(results) >= QUORUM_REQUIRED) {
    return { results, retried: [] };
  }

  const failedNames = new Set(
    results.filter((result) => result.status.status !== "success").map((result) => result.name),
  );
  const retrySpecs = specs.filter((spec) => failedNames.has(spec.name));

  if (retrySpecs.length === 0) {
    return { results, retried: [] };
  }

  logProviderQuorumRetry(requestLogger(requestId, API_ROUTES.search), {
    providersSucceeded: countSucceededProviders(results),
    providersRequired: QUORUM_REQUIRED,
    retryingProviders: retrySpecs.map((spec) => spec.name),
    retryTimeoutMs: PROVIDER_RETRY_TIMEOUT_MS,
  });

  const retried = await withSpan("provider.quorum_retry", async () =>
    fanOutProviders(retrySpecs, PROVIDER_RETRY_TIMEOUT_MS),
  );
  const byName = new Map(results.map((result) => [result.name, result]));
  for (const result of retried) {
    byName.set(result.name, result);
  }

  return {
    results: specs.map((spec) => byName.get(spec.name)!),
    retried,
  };
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

function failedProvidersFromMap(providers: TripSearchResult["providers"]) {
  return Object.entries(providers)
    .filter(([, status]) => status.status !== "success")
    .map(([name, status]) => ({
      name,
      status: status.status,
      error: status.error,
      durationMs: status.durationMs,
    }));
}

export async function searchTrip(
  query: string,
  requestId = uuidv4(),
  context?: TripSearchParams | null,
): Promise<TripSearchResult> {
  const started = Date.now();
  const parsedQuery = await withSpan("llm.parse", async () =>
    parseTripQuery(query, context, { mode: "sync" }),
  );
  return executeTripSearch(parsedQuery, requestId, started);
}

async function refreshTripSearchCache(parsedQuery: TripSearchParams): Promise<TripSearchResult | null> {
  try {
    return await finalizeTripSearch(parsedQuery, uuidv4(), Date.now());
  } catch (error) {
    logCacheRefreshFailure(requestLogger(uuidv4(), API_ROUTES.search), error, "background");
    return null;
  }
}

async function executeTripSearch(
  parsedQuery: TripSearchParams,
  requestId: string,
  started: number,
): Promise<TripSearchResult> {
  const lookup = await withSpan("cache.lookup", async () => {
    const result = await lookupTripSearchCache(parsedQuery);
    recordCacheLookup(result.status);
    return result;
  });

  if (lookup.status === "fresh" && lookup.entry) {
    const cached = materializeCachedResult(lookup.entry, requestId, started, "fresh");
    void saveTripResult(cached);
    return cached;
  }

  if (lookup.status === "stale" && lookup.entry) {
    void runWithRefreshLock(
      lookup.entry.cacheKey,
      async () => {
        const refreshed = await refreshTripSearchCache(parsedQuery);
        if (refreshed) {
          await saveTripSearchCache(parsedQuery, refreshed);
        }
        return refreshed;
      },
      parsedQuery,
    ).catch((error) => {
      logCacheRefreshFailure(requestLogger(requestId, API_ROUTES.search), error, "stale");
    });

    const cached = materializeCachedResult(lookup.entry, requestId, started, "stale");
    void saveTripResult(cached);
    return cached;
  }

  const result = await finalizeTripSearch(parsedQuery, requestId, started);
  const entry = await saveTripSearchCache(parsedQuery, result);
  void saveTripResult(result);

  return attachCacheMeta(result, "miss", entry);
}

async function finalizeTripSearch(
  parsedQuery: TripSearchParams,
  requestId: string,
  started: number,
): Promise<TripSearchResult> {
  const providerSpecs = buildProviderJobSpecs(toProviderFanOutPayload(parsedQuery));
  const initialResults = await fanOutProviders(providerSpecs);
  const { results } = await maybeRetryFailedProvidersForQuorum(
    initialResults,
    providerSpecs,
    requestId,
  );

  return withSpan("package.response", async () =>
    assembleTripResponse(parsedQuery, requestId, started, results),
  );
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

async function assembleTripResponse(
  parsedQuery: TripSearchParams,
  requestId: string,
  started: number,
  results: ProviderRunResult[],
): Promise<TripSearchResult> {
  const succeeded = results.filter((r) => r.status.status === "success").length;

  if (succeeded < 2) {
    recordQuorumFailure();
    const details: QuorumFailureDetails = {
      requestId,
      providersSucceeded: succeeded,
      providersRequired: 2,
      providerTimeoutMs: PROVIDER_TIMEOUT_MS,
      route: `${parsedQuery.flights.origin} → ${parsedQuery.flights.destination}`,
      providers: buildProviderStatusMap(results),
    };
    logQuorumFailure(requestLogger(requestId, API_ROUTES.search), {
      providersSucceeded: details.providersSucceeded,
      providersRequired: details.providersRequired,
      providerTimeoutMs: details.providerTimeoutMs,
      failedProviders: failedProvidersFromMap(details.providers),
      durationMs: Date.now() - started,
    });
    throw new QuorumError(details);
  }

  return withSpan("rank.budget", async () =>
    buildTripSnapshot(parsedQuery, requestId, started, results, true),
  );
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

  const cacheLookup = await withSpan("cache.lookup", async () => {
    const result = await lookupTripSearchCache(parsedQuery);
    recordCacheLookup(result.status);
    return result;
  });

  if (cacheLookup.status === "fresh" && cacheLookup.entry) {
    const cached = materializeCachedResult(cacheLookup.entry, requestId, started, "fresh");
    await saveTripResult(cached);

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
    await saveTripResult(cached);

    yield {
      type: "status",
      message: "Showing cached prices — refreshing shortly...",
      progress: 40,
    };
    yield { type: "offers_update", update: toClientOffersUpdate(cached) };
    yield { type: "complete", result: toClientTripResponse(cached) };

    const refreshed = await runWithRefreshLock(
      cacheLookup.entry.cacheKey,
      async () => {
        const result = await refreshTripSearchCache(parsedQuery);
        if (result) {
          await saveTripSearchCache(parsedQuery, result);
        }
        return result;
      },
      parsedQuery,
    );

    if (refreshed) {
      const entry = (await lookupTripSearchCache(parsedQuery)).entry;
      const updated = attachCacheMeta({ ...refreshed, requestId }, "fresh", entry);
      await saveTripResult(updated);

      yield { type: "status", message: "Prices updated", progress: 95 };
      yield { type: "offers_update", update: toClientOffersUpdate(updated) };
      yield { type: "complete", result: toClientTripResponse(updated) };
    }

    return;
  }

  const providerSpecs = buildProviderJobSpecs(toProviderFanOutPayload(parsedQuery));

  yield {
    type: "status",
    message: "Searching our flight and hotel inventory...",
    progress: 35,
  };

  const providerJobs = providerSpecs.map((spec) => ({
    name: spec.name,
    promise: runProvider(spec.name, spec.domain, spec.fn, spec.normalize),
  }));

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

    logProviderResult(requestLogger(requestId, API_ROUTES.searchStream), {
      provider: finished.name,
      status: finished.result.status.status,
      offerCount: finished.result.status.offerCount,
      durationMs: finished.result.status.durationMs,
      error: finished.result.status.error,
    });

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

  const { results: quorumResults, retried } = await maybeRetryFailedProvidersForQuorum(
    providerResults,
    providerSpecs,
    requestId,
  );

  if (retried.length > 0) {
    yield {
      type: "status",
      message: "Retrying unavailable providers...",
      progress: 90,
    };

    for (const retryResult of retried) {
      logProviderResult(requestLogger(requestId, API_ROUTES.searchStream), {
        provider: retryResult.name,
        status: retryResult.status.status,
        offerCount: retryResult.status.offerCount,
        durationMs: retryResult.status.durationMs,
        error: retryResult.status.error,
        attempt: 2,
      });

      yield {
        type: "provider",
        provider: retryResult.name,
        status: retryResult.status,
      };
    }

    const partial = buildTripSnapshot(parsedQuery, requestId, started, quorumResults, false);
    yield { type: "offers_update", update: toClientOffersUpdate(partial) };
  }

  const result = await assembleTripResponse(parsedQuery, requestId, started, quorumResults);
  await saveTripSearchCache(parsedQuery, result);

  const entry = (await lookupTripSearchCache(parsedQuery)).entry;
  const withCache = attachCacheMeta(result, "miss", entry);
  await saveTripResult(withCache);

  yield { type: "status", message: "Your trip is ready!", progress: 100 };
  yield { type: "complete", result: toClientTripResponse(withCache) };
}
