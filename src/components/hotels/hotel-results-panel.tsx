"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bed, Loader2, SlidersHorizontal } from "lucide-react";
import { HotelStayBuilder } from "@/components/hotels/hotel-stay-builder";
import { HotelCard } from "@/components/hotels/hotel-card";
import {
  comboWithinBudgetFlag,
  maxAffordablePrice,
} from "@/lib/client/trip-budget";
import {
  appendStaySegment,
  isOfferInStays,
  remainingNights,
  removeStaySegment,
  segmentsForOffer,
  staySegmentPrice,
  totalStaysPrice,
  updateStayNights,
} from "@/lib/client/hotel-stays";
import { hotelFiltersFromPreferences } from "@/lib/client/parsed-preferences";
import type { HotelStaySegment, PublicHotelOffer, TripSearchResponse } from "@/lib/types/trip";
import { nightsBetween } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

type HotelSortOption = "best" | "price" | "rating";

type HotelResultsPanelProps = {
  result: TripSearchResponse;
  searching?: boolean;
  hotelStays: HotelStaySegment[];
  onChangeStays: (stays: HotelStaySegment[]) => void;
  pairedFlightPrice: number;
  budgetMax?: number;
};

function sortHotels(offers: PublicHotelOffer[], sort: HotelSortOption): PublicHotelOffer[] {
  const sorted = [...offers];
  if (sort === "price") {
    return sorted.sort((a, b) => a.totalPrice - b.totalPrice);
  }
  if (sort === "rating") {
    return sorted.sort((a, b) => {
      const aStars = Number.parseInt(a.category, 10) || 0;
      const bStars = Number.parseInt(b.category, 10) || 0;
      return bStars - aStars || a.totalPrice - b.totalPrice;
    });
  }
  return sorted.sort((a, b) => a.totalPrice - b.totalPrice);
}

export function HotelResultsPanel({
  result,
  searching = false,
  hotelStays,
  onChangeStays,
  pairedFlightPrice,
  budgetMax,
}: HotelResultsPanelProps) {
  const allOffers = result.hotels.offers;
  const tripCheckIn = result.parsedQuery.hotels.checkIn;
  const tripNights = nightsBetween(tripCheckIn, result.parsedQuery.hotels.checkOut);
  const nightsLeft = remainingNights(tripNights, hotelStays);

  const parsedHotelPrefs = useMemo(
    () =>
      hotelFiltersFromPreferences(result.parsedQuery.preferences, {
        sort: "best" as HotelSortOption,
        withinBudgetOnly: Boolean(budgetMax),
      }),
    [result.parsedQuery.preferences, budgetMax],
  );

  const [sort, setSort] = useState<HotelSortOption>(parsedHotelPrefs.sort);
  const [withinBudgetOnly, setWithinBudgetOnly] = useState(parsedHotelPrefs.withinBudgetOnly);
  const [pickingOfferId, setPickingOfferId] = useState<string | null>(null);

  useEffect(() => {
    setSort(parsedHotelPrefs.sort);
    setWithinBudgetOnly(parsedHotelPrefs.withinBudgetOnly);
  }, [parsedHotelPrefs]);

  const affordableMax = budgetMax !== undefined ? maxAffordablePrice(budgetMax, pairedFlightPrice) : null;
  const currentHotelTotal = totalStaysPrice(hotelStays, allOffers);

  const filteredOffers = useMemo(() => {
    let offers = sortHotels(allOffers, sort);
    if (parsedHotelPrefs.minStars !== undefined) {
      offers = offers.filter(
        (offer) => (Number.parseInt(offer.category, 10) || 0) >= parsedHotelPrefs.minStars!,
      );
    }
    if (withinBudgetOnly && budgetMax !== undefined) {
      offers = offers.filter((offer) =>
        comboWithinBudgetFlag(pairedFlightPrice, offer.totalPrice, budgetMax),
      );
    }
    return offers;
  }, [allOffers, sort, withinBudgetOnly, budgetMax, pairedFlightPrice, parsedHotelPrefs.minStars]);

  useEffect(() => {
    if (filteredOffers.length === 0) return;
    const staysValid = hotelStays.every((stay) =>
      filteredOffers.some((offer) => offer.id === stay.offerId),
    );
    if (!staysValid || hotelStays.length === 0) {
      const first = filteredOffers[0]!;
      onChangeStays([
        {
          id: `${first.id}-full`,
          offerId: first.id,
          nights: tripNights,
          checkIn: first.checkIn,
          checkOut: first.checkOut,
        },
      ]);
    }
  }, [filteredOffers, hotelStays, onChangeStays, tripNights]);

  const handlePickOffer = useCallback(
    (offerId: string, maxNights: number) => {
      if (maxNights <= 0) return;
      if (pickingOfferId === offerId) {
        setPickingOfferId(null);
        return;
      }
      setPickingOfferId(offerId);
    },
    [pickingOfferId],
  );

  const handleConfirmNights = useCallback(
    (offer: PublicHotelOffer, nights: number) => {
      const replacingFullStay =
        hotelStays.length === 1 &&
        hotelStays[0]!.nights === tripNights &&
        hotelStays[0]!.offerId !== offer.id;

      if (replacingFullStay) {
        onChangeStays(appendStaySegment([], offer, nights, tripCheckIn));
      } else if (nightsLeft > 0) {
        onChangeStays(appendStaySegment(hotelStays, offer, nights, tripCheckIn));
      }
      setPickingOfferId(null);
    },
    [hotelStays, nightsLeft, onChangeStays, tripCheckIn, tripNights],
  );

  const handleRemoveStay = useCallback(
    (segmentId: string) => {
      const next = removeStaySegment(hotelStays, segmentId, tripCheckIn);
      if (next.length > 0) {
        onChangeStays(next);
      } else {
        const fallback = filteredOffers[0];
        if (fallback) {
          onChangeStays([
            {
              id: `${fallback.id}-full`,
              offerId: fallback.id,
              nights: tripNights,
              checkIn: fallback.checkIn,
              checkOut: fallback.checkOut,
            },
          ]);
        }
      }
      setPickingOfferId(null);
    },
    [hotelStays, filteredOffers, onChangeStays, tripCheckIn, tripNights],
  );

  const handleUpdateNights = useCallback(
    (segmentId: string, nights: number) => {
      onChangeStays(updateStayNights(hotelStays, segmentId, nights, tripCheckIn, tripNights));
    },
    [hotelStays, onChangeStays, tripCheckIn, tripNights],
  );

  const noResults = allOffers.length === 0;
  const noFilteredResults = !noResults && filteredOffers.length === 0;
  const awaitingFirstResults = searching && noResults;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {!noResults && (
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-5 py-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <SlidersHorizontal className="h-4 w-4 text-purple-600" />
              Filters
            </div>
          </div>

          <div className="space-y-6">
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sort by
              </p>
              <div className="space-y-1.5">
                {(
                  [
                    { value: "best", label: "Best match" },
                    { value: "price", label: "Lowest price" },
                    { value: "rating", label: "Highest rating" },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm",
                      sort === option.value ? "bg-purple-50 text-purple-800" : "text-gray-700",
                    )}
                  >
                    <input
                      type="radio"
                      name="hotel-sort"
                      checked={sort === option.value}
                      onChange={() => setSort(option.value)}
                      className="accent-purple-600"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </section>

            {budgetMax !== undefined && (
              <section className="rounded-xl bg-purple-50/60 p-4 ring-1 ring-purple-100">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={withinBudgetOnly}
                    onChange={(e) => setWithinBudgetOnly(e.target.checked)}
                    className="mt-0.5 rounded accent-purple-600"
                  />
                  <span>
                    Within ${budgetMax.toLocaleString()} trip budget
                    {pairedFlightPrice > 0 && affordableMax !== null && (
                      <span className="mt-1 block text-xs text-gray-500">
                        Up to ${affordableMax.toLocaleString()} for hotel with your selected flight
                      </span>
                    )}
                  </span>
                </label>
              </section>
            )}
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {awaitingFirstResults && (
            <div className="mx-auto max-w-xl rounded-2xl border border-purple-100 bg-purple-50/60 px-6 py-10 text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-purple-500" />
              <p className="text-base font-medium text-gray-900">Searching hotel inventory...</p>
              <p className="mt-2 text-sm text-gray-600">
                Stays appear as inventory loads — best matches rise to the top.
              </p>
            </div>
          )}

          {noResults && !awaitingFirstResults && (
            <div className="mx-auto max-w-xl rounded-2xl border border-amber-100 bg-amber-50 px-6 py-8 text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
              <p className="text-base font-medium text-amber-900">
                {budgetMax !== undefined
                  ? `No hotels within your $${budgetMax.toLocaleString()} trip budget`
                  : "No hotels matched your search"}
              </p>
              <p className="mt-2 text-sm text-amber-800/80">
                {budgetMax !== undefined && result.tripSummary.suggestedMinBudget
                  ? `The cheapest trip starts at $${result.tripSummary.suggestedMinBudget.toLocaleString()}. Try increasing your budget or adjusting dates.`
                  : "Try changing your dates or destination in the chat."}
              </p>
            </div>
          )}

          {noFilteredResults && (
            <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white px-6 py-8 text-center">
              <Bed className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              <p className="text-base font-medium text-gray-900">No hotels match your filters</p>
              <p className="mt-2 text-sm text-gray-500">
                Try relaxing your filters to see more options.
              </p>
              <button
                type="button"
                onClick={() => setWithinBudgetOnly(false)}
                className="mt-4 rounded-full border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-800"
              >
                Show all hotels
              </button>
            </div>
          )}

          {filteredOffers.length > 0 && (
            <HotelStayBuilder
              stays={hotelStays}
              offers={allOffers}
              tripNights={tripNights}
              remaining={nightsLeft}
              onRemove={handleRemoveStay}
              onUpdateNights={handleUpdateNights}
            />
          )}

          <div className="space-y-2">
            {filteredOffers.map((offer) => {
              const offerSegments = segmentsForOffer(hotelStays, offer.id);
              const picking = pickingOfferId === offer.id;
              const replacingFullStay =
                hotelStays.length === 1 &&
                hotelStays[0]!.nights === tripNights &&
                hotelStays[0]!.offerId !== offer.id;
              const maxNights = replacingFullStay ? tripNights : nightsLeft;
              const defaultNights = Math.max(1, Math.min(maxNights, 1));
              const addPrice = maxNights > 0 ? staySegmentPrice(offer, defaultNights) : 0;
              const projectedTotal = replacingFullStay
                ? addPrice
                : currentHotelTotal + addPrice;

              return (
                <HotelCard
                  key={offer.id}
                  offer={offer}
                  selected={isOfferInStays(hotelStays, offer.id)}
                  staySegments={offerSegments}
                  onSelect={() => handlePickOffer(offer.id, maxNights)}
                  pickingNights={picking}
                  maxNights={maxNights}
                  defaultNights={defaultNights}
                  onConfirmNights={(nights) => handleConfirmNights(offer, nights)}
                  onCancelPick={() => setPickingOfferId(null)}
                  withinBudget={comboWithinBudgetFlag(
                    pairedFlightPrice,
                    projectedTotal,
                    budgetMax,
                  )}
                />
              );
            })}
          </div>

          {(searching || result.meta.partialResults) && filteredOffers.length > 0 && (
            <p className="mt-5 text-center text-xs text-amber-600">
              Still searching — list updates as more providers respond.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
