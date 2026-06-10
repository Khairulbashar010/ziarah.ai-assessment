"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bed, Calendar, Plane, Users, Wallet } from "lucide-react";
import { FlightResultsPanel } from "@/components/flights/flight-results-panel";
import { HotelResultsPanel } from "@/components/hotels/hotel-results-panel";
import { TripFooter } from "@/components/trip/trip-footer";
import { RouteTimeline } from "@/components/trip/route-timeline";
import {
  createFullStay,
  staySegmentPrice,
  totalStaysPrice,
} from "@/lib/client/hotel-stays";
import {
  findCheapestCompatibleFlight,
  findCheapestCompatibleHotel,
  isComboWithinBudget,
  pickCheapestCombo,
} from "@/lib/client/trip-budget";
import { getAirportByCode } from "@/lib/geo/airports";
import { resolveFlightAirportCode } from "@/lib/geo/resolve-flight-airport";
import type { HotelStaySegment, TripSearchResponse } from "@/lib/types/trip";
import { formatDateRange } from "@/lib/utils/dates";
import { totalPassengers } from "@/lib/utils/trip";
import { cn } from "@/lib/utils/cn";

type TripTab = "flights" | "hotels";

type TripResultsPanelProps = {
  result: TripSearchResponse;
  searching?: boolean;
};

function MetaChip({ icon: Icon, children }: { icon: typeof Users; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-purple-100">
      <Icon className="h-3.5 w-3.5 text-purple-500" />
      {children}
    </span>
  );
}

function buildInitialStays(
  hotelId: string | null,
  hotels: TripSearchResponse["hotels"]["offers"],
): HotelStaySegment[] {
  const hotel = hotels.find((offer) => offer.id === hotelId) ?? hotels[0];
  return hotel ? [createFullStay(hotel)] : [];
}

export function TripResultsPanel({ result, searching = false }: TripResultsPanelProps) {
  const { parsedQuery, tripSummary } = result;
  const budgetMax = parsedQuery.budget?.maxTotal;
  const flights = result.flights.offers;
  const hotels = result.hotels.offers;

  const initialSelection = useMemo(
    () => pickCheapestCombo(flights, hotels, budgetMax),
    [flights, hotels, budgetMax],
  );

  const [activeTab, setActiveTab] = useState<TripTab>("flights");
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(
    () => initialSelection.flightId,
  );
  const [hotelStays, setHotelStays] = useState<HotelStaySegment[]>(() =>
    buildInitialStays(initialSelection.hotelId, hotels),
  );

  useEffect(() => {
    const flight = flights.find((offer) => offer.id === selectedFlightId);
    const hotelTotal = totalStaysPrice(hotelStays, hotels);
    const selectionValid =
      flight && hotelStays.length > 0 && isComboWithinBudget(flight.totalPrice, hotelTotal, budgetMax);

    if (!selectionValid) {
      setSelectedFlightId(initialSelection.flightId);
      setHotelStays(buildInitialStays(initialSelection.hotelId, hotels));
    }
  }, [
    flights,
    hotels,
    hotelStays,
    selectedFlightId,
    budgetMax,
    initialSelection.flightId,
    initialSelection.hotelId,
  ]);

  const selectedFlight =
    flights.find((offer) => offer.id === selectedFlightId) ?? flights[0];

  const pairedFlightPrice = selectedFlight?.totalPrice ?? 0;
  const pairedHotelPrice = totalStaysPrice(hotelStays, hotels);
  const tripTotal =
    selectedFlight && hotelStays.length > 0
      ? pairedFlightPrice + pairedHotelPrice
      : tripSummary.estimatedTripTotal;

  const withinBudget =
    budgetMax !== undefined && tripTotal !== null ? tripTotal <= budgetMax : null;

  const hotelBreakdown = useMemo(
    () =>
      hotelStays
        .map((stay) => {
          const offer = hotels.find((hotel) => hotel.id === stay.offerId);
          if (!offer) return null;
          return {
            label:
              hotelStays.length > 1
                ? `${offer.hotelName} (${stay.nights}n)`
                : offer.hotelName,
            price: staySegmentPrice(offer, stay.nights),
          };
        })
        .filter((item): item is { label: string; price: number } => item !== null),
    [hotelStays, hotels],
  );

  const hotelSummaryLabel = useMemo(() => {
    if (hotelStays.length === 0) return undefined;
    if (hotelStays.length === 1) {
      return hotels.find((hotel) => hotel.id === hotelStays[0]!.offerId)?.hotelName;
    }
    return `${hotelStays.length} hotel stays`;
  }, [hotelStays, hotels]);

  const handleSelectFlight = useCallback(
    (flightId: string) => {
      const flight = flights.find((offer) => offer.id === flightId);
      if (!flight) return;

      setSelectedFlightId(flightId);

      const hotelTotal = totalStaysPrice(hotelStays, hotels);
      if (!isComboWithinBudget(flight.totalPrice, hotelTotal, budgetMax)) {
        const replacement = findCheapestCompatibleHotel(flight, hotels, budgetMax);
        if (replacement) setHotelStays([createFullStay(replacement)]);
      }
    },
    [flights, hotels, hotelStays, budgetMax],
  );

  const handleChangeStays = useCallback(
    (stays: HotelStaySegment[]) => {
      setHotelStays(stays);

      const hotelTotal = totalStaysPrice(stays, hotels);
      const currentFlight = flights.find((offer) => offer.id === selectedFlightId);
      if (
        currentFlight &&
        !isComboWithinBudget(currentFlight.totalPrice, hotelTotal, budgetMax)
      ) {
        const replacement = findCheapestCompatibleFlight(
          hotels.find((hotel) => hotel.id === stays[0]?.offerId) ?? hotels[0]!,
          flights,
          budgetMax,
        );
        if (replacement) setSelectedFlightId(replacement.id);
      }
    },
    [flights, hotels, selectedFlightId, budgetMax],
  );

  const originCode = resolveFlightAirportCode(parsedQuery.flights.origin);
  const destCode = resolveFlightAirportCode(parsedQuery.flights.destination);
  const pax = totalPassengers(parsedQuery.flights.passengers);
  const originCity = getAirportByCode(originCode)?.city ?? parsedQuery.flights.origin;
  const dateRange = formatDateRange(parsedQuery.hotels.checkIn, parsedQuery.hotels.checkOut);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f4f2f8]">
      <div className="shrink-0 border-b border-purple-100/80 bg-gradient-to-br from-purple-50 via-white to-indigo-50 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-900">
              {originCity} to {parsedQuery.hotels.destination}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <MetaChip icon={Users}>
                {pax} traveller{pax !== 1 ? "s" : ""}
              </MetaChip>
              <MetaChip icon={Calendar}>{dateRange}</MetaChip>
              {budgetMax !== undefined && (
                <MetaChip icon={Wallet}>${budgetMax.toLocaleString()} budget</MetaChip>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <span className="rounded-xl bg-white/80 px-3 py-2 text-center text-sm shadow-sm ring-1 ring-purple-100">
              <span className="block font-bold text-gray-900">{flights.length}</span>
              <span className="text-xs text-gray-500">flights</span>
            </span>
            <span className="rounded-xl bg-white/80 px-3 py-2 text-center text-sm shadow-sm ring-1 ring-purple-100">
              <span className="block font-bold text-gray-900">{hotels.length}</span>
              <span className="text-xs text-gray-500">hotels</span>
            </span>
          </div>
        </div>

        <RouteTimeline
          className="mt-5"
          originCode={originCode}
          destinationCode={destCode}
          destinationName={parsedQuery.hotels.destination}
          checkIn={parsedQuery.hotels.checkIn}
          checkOut={parsedQuery.hotels.checkOut}
          roundTrip={parsedQuery.tripType === "ROUND_TRIP"}
        />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-3">
        <div className="inline-flex gap-1 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("flights")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all",
              activeTab === "flights"
                ? "bg-white text-purple-800 shadow-sm"
                : "text-gray-600 hover:text-gray-900",
            )}
          >
            <Plane className="h-4 w-4" />
            Flights
            {flights.length > 0 && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                {flights.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("hotels")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-all",
              activeTab === "hotels"
                ? "bg-white text-purple-800 shadow-sm"
                : "text-gray-600 hover:text-gray-900",
            )}
          >
            <Bed className="h-4 w-4" />
            Hotels
            {hotels.length > 0 && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                {hotels.length}
              </span>
            )}
          </button>
        </div>

        {selectedFlight && hotelStays.length > 0 && (
          <p className="hidden text-sm text-gray-500 md:block">
            <span className="font-medium text-gray-700">{selectedFlight.validatingCarrier}</span>
            {" · "}
            <span className="font-medium text-gray-700">{hotelSummaryLabel}</span>
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeTab === "flights" ? (
          <FlightResultsPanel
            result={result}
            searching={searching}
            embedded
            selectedFlightId={selectedFlightId}
            onSelectFlight={handleSelectFlight}
            pairedHotelPrice={pairedHotelPrice}
          />
        ) : (
          <HotelResultsPanel
            result={result}
            searching={searching}
            hotelStays={hotelStays}
            onChangeStays={handleChangeStays}
            pairedFlightPrice={pairedFlightPrice}
            budgetMax={budgetMax}
          />
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-[#f4f2f8] px-6 py-4">
        <TripFooter
          total={tripTotal}
          currency={tripSummary.currency}
          withinBudget={withinBudget}
          budget={budgetMax}
          flightPrice={selectedFlight ? pairedFlightPrice : undefined}
          hotelPrice={hotelStays.length > 0 ? pairedHotelPrice : undefined}
          flightLabel={
            selectedFlight
              ? `${selectedFlight.validatingCarrier} flight`
              : undefined
          }
          hotelLabel={hotelSummaryLabel}
          hotelBreakdown={hotelBreakdown.length > 1 ? hotelBreakdown : undefined}
        />
      </div>
    </div>
  );
}
