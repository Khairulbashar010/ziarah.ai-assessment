"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Plane } from "lucide-react";
import { FlightCard } from "@/components/flights/flight-card";
import { FlightFilters } from "@/components/flights/flight-filters";
import { RouteTimeline } from "@/components/trip/route-timeline";
import {
  applyFlightFilters,
  getAvailableAirlines,
  getDefaultFlightFilters,
  getPriceRange,
  type FlightFilterState,
} from "@/lib/client/flight-filters";
import { flightFiltersFromPreferences } from "@/lib/client/parsed-preferences";
import {
  comboWithinBudgetFlag,
  maxAffordablePrice,
} from "@/lib/client/trip-budget";
import { getAirportByCode } from "@/lib/geo/airports";
import { resolveFlightAirportCode } from "@/lib/geo/resolve-flight-airport";
import type { TripSearchResponse } from "@/lib/types/trip";
import { totalPassengers } from "@/lib/utils/trip";

type FlightResultsPanelProps = {
  result: TripSearchResponse;
  searching?: boolean;
  embedded?: boolean;
  selectedFlightId?: string | null;
  onSelectFlight?: (id: string) => void;
  pairedHotelPrice?: number;
};

export function FlightResultsPanel({
  result,
  searching = false,
  embedded = false,
  selectedFlightId: controlledFlightId,
  onSelectFlight,
  pairedHotelPrice = 0,
}: FlightResultsPanelProps) {
  const { parsedQuery, tripSummary } = result;
  const allOffers = result.flights.offers;
  const budgetMax = parsedQuery.budget?.maxTotal;
  const affordableMax =
    budgetMax !== undefined ? maxAffordablePrice(budgetMax, pairedHotelPrice) : budgetMax;

  const defaults = useMemo(
    () =>
      flightFiltersFromPreferences(
        parsedQuery.preferences,
        getDefaultFlightFilters(allOffers, affordableMax),
      ),
    [allOffers, affordableMax, parsedQuery.preferences],
  );
  const [filters, setFilters] = useState<FlightFilterState>(defaults);
  const [internalFlightId, setInternalFlightId] = useState<string | null>(
    () => allOffers[0]?.id ?? null,
  );

  const selectedFlightId = controlledFlightId ?? internalFlightId;
  const setSelectedFlightId = onSelectFlight ?? setInternalFlightId;

  useEffect(() => {
    setFilters(defaults);
  }, [defaults]);

  const filteredOffers = useMemo(() => {
    let offers = applyFlightFilters(allOffers, filters, affordableMax);
    if (filters.withinBudgetOnly && budgetMax !== undefined) {
      offers = offers.filter((offer) =>
        comboWithinBudgetFlag(offer.totalPrice, pairedHotelPrice, budgetMax),
      );
    }
    return offers;
  }, [allOffers, filters, affordableMax, budgetMax, pairedHotelPrice]);

  useEffect(() => {
    if (filteredOffers.length === 0) {
      if (!onSelectFlight) setInternalFlightId(null);
      return;
    }

    if (!filteredOffers.some((offer) => offer.id === selectedFlightId)) {
      const nextId = filteredOffers[0]!.id;
      if (onSelectFlight) onSelectFlight(nextId);
      else setInternalFlightId(nextId);
    }
  }, [filteredOffers, selectedFlightId, onSelectFlight]);

  const airlines = useMemo(() => getAvailableAirlines(allOffers), [allOffers]);
  const priceRange = useMemo(() => getPriceRange(allOffers), [allOffers]);

  const originCode = resolveFlightAirportCode(parsedQuery.flights.origin);
  const destCode = resolveFlightAirportCode(parsedQuery.flights.destination);
  const pax = totalPassengers(parsedQuery.flights.passengers);
  const originCity = getAirportByCode(originCode)?.city ?? parsedQuery.flights.origin;

  const selectedFlight = filteredOffers.find((f) => f.id === selectedFlightId)
    ?? allOffers.find((f) => f.id === selectedFlightId);
  const displayPrice = selectedFlight?.totalPrice ?? tripSummary.cheapestFlight;

  const noResults = allOffers.length === 0;
  const noFilteredResults = !noResults && filteredOffers.length === 0;
  const awaitingFirstResults = searching && noResults;

  return (
    <div className={embedded ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "flex h-full flex-col overflow-hidden bg-gray-50"}>
      {!embedded && (
        <div className="shrink-0 border-b border-gray-200 bg-white px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {originCity} to {parsedQuery.hotels.destination}
              </h2>
              <p className="text-sm text-gray-500">
                {pax} traveller{pax !== 1 ? "s" : ""}
                {parsedQuery.flights.cabin !== "ECONOMY" && ` · ${parsedQuery.flights.cabin.replace("_", " ")}`}
                {budgetMax !== undefined && ` · Budget $${budgetMax.toLocaleString()}`}
              </p>
            </div>
            {!noResults && (
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{filteredOffers.length}</span> of{" "}
                {result.flights.truncated ? result.flights.totalOffers : allOffers.length} flights
                {result.flights.truncated && (
                  <span className="text-gray-400"> (top {allOffers.length} shown)</span>
                )}
              </p>
            )}
          </div>
          <div className="mt-3">
            <RouteTimeline
              originCode={originCode}
              destinationCode={destCode}
              destinationName={parsedQuery.hotels.destination}
              checkIn={parsedQuery.hotels.checkIn}
              checkOut={parsedQuery.hotels.checkOut}
              roundTrip={parsedQuery.tripType === "ROUND_TRIP"}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!noResults && (
          <FlightFilters
            filters={filters}
            defaults={defaults}
            airlines={airlines}
            priceRange={priceRange}
            budgetMax={budgetMax}
            budgetLabel={
              pairedHotelPrice > 0 && budgetMax !== undefined
                ? `Within $${budgetMax.toLocaleString()} trip budget`
                : undefined
            }
            budgetHint={
              pairedHotelPrice > 0 && affordableMax !== undefined
                ? `Up to $${affordableMax.toLocaleString()} for flight with selected hotel`
                : undefined
            }
            onChange={setFilters}
            onReset={() => setFilters(defaults)}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {awaitingFirstResults && (
              <div className="mx-auto max-w-lg rounded-2xl border border-purple-100 bg-purple-50/60 px-6 py-10 text-center">
                <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-purple-500" />
                <p className="text-base font-medium text-gray-900">Searching flight inventory...</p>
                <p className="mt-2 text-sm text-gray-600">
                  Results appear as each provider responds — fastest routes rise to the top.
                </p>
              </div>
            )}

            {noResults && !awaitingFirstResults && (
              <div className="mx-auto max-w-lg rounded-2xl border border-amber-100 bg-amber-50 px-6 py-8 text-center">
                <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
                <p className="text-base font-medium text-amber-900">
                  {budgetMax !== undefined
                    ? `No flights within your $${budgetMax.toLocaleString()} budget`
                    : "No flights matched your search"}
                </p>
                <p className="mt-2 text-sm text-amber-800/80">
                  {budgetMax !== undefined && tripSummary.suggestedMinBudget
                    ? `The cheapest option starts at $${tripSummary.suggestedMinBudget.toLocaleString()}. Try increasing your budget or adjusting dates.`
                    : "Try changing your dates or route in the chat."}
                </p>
              </div>
            )}

            {noFilteredResults && (
              <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white px-6 py-8 text-center">
                <Plane className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                <p className="text-base font-medium text-gray-900">No flights match your filters</p>
                <p className="mt-2 text-sm text-gray-500">
                  Try relaxing your filters to see more options.
                </p>
                <button
                  type="button"
                  onClick={() => setFilters(defaults)}
                  className="mt-4 rounded-full border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-800"
                >
                  Clear filters
                </button>
              </div>
            )}

            <div className="space-y-3">
              {filteredOffers.map((offer) => (
                <FlightCard
                  key={offer.id}
                  offer={offer}
                  selected={selectedFlightId === offer.id}
                  onSelect={() => setSelectedFlightId(offer.id)}
                  withinBudget={comboWithinBudgetFlag(
                    offer.totalPrice,
                    pairedHotelPrice,
                    budgetMax,
                  )}
                />
              ))}
            </div>

            {(searching || result.meta.partialResults) && filteredOffers.length > 0 && (
              <p className="mt-4 text-center text-xs text-amber-600">
                Still searching — list updates as more providers respond. Best matches stay on top.
              </p>
            )}

            {!searching &&
              result.meta.cache.status === "fresh" &&
              result.meta.cache.refreshInMs !== null &&
              result.meta.cache.refreshInMs > 0 && (
                <p className="mt-4 text-center text-xs text-gray-500">
                  Prices refresh in {Math.ceil(result.meta.cache.refreshInMs / 60_000)} min
                </p>
              )}

            {!searching && result.meta.cache.status === "stale" && (
              <p className="mt-4 text-center text-xs text-amber-600">
                Showing cached prices — refreshing now...
              </p>
            )}
          </div>

          {!embedded && (
            <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Selected flight</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {displayPrice !== null ? `$${displayPrice.toLocaleString()}` : "—"}
                  </p>
                  {budgetMax !== undefined && displayPrice !== null && (
                    <p
                      className={
                        comboWithinBudgetFlag(displayPrice, pairedHotelPrice, budgetMax)
                          ? "text-xs text-emerald-600"
                          : "text-xs text-amber-600"
                      }
                    >
                      {comboWithinBudgetFlag(displayPrice, pairedHotelPrice, budgetMax)
                        ? `Within $${budgetMax.toLocaleString()} trip budget`
                        : `$${(displayPrice + pairedHotelPrice - budgetMax).toLocaleString()} over trip budget`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!selectedFlight}
                  className="rounded-2xl bg-[#1a1035] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Select flight
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
