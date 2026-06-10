import type { UnifiedFlightOffer } from "@/lib/types/trip";
import { roundMoney } from "@/lib/utils/money";

type SabreScheduleDesc = {
  id: number;
  stopCount?: number;
  departure?: { airport?: string; time?: string };
  arrival?: { airport?: string; time?: string; dateAdjustment?: number };
  carrier?: { marketing?: string; marketingFlightNumber?: number | string };
  elapsedTime?: number;
};

type SabreLegDesc = {
  id: number;
  schedules?: Array<{ ref: number }>;
};

type SabreItineraryLeg = {
  ref: number;
  schedules?: Array<{ ref: number }>;
};

type SabreItinerary = {
  id: number;
  legs?: SabreItineraryLeg[];
  pricingInformation?: Array<{
    offer?: { offerId?: string };
    fare?: {
      validatingCarrierCode?: string;
      totalFare?: { totalPrice?: number; currency?: string };
      passengerInfoList?: Array<{
        passengerInfo?: {
          nonRefundable?: boolean;
          passengerTotalFare?: { totalFare?: number; currency?: string };
          passengerNumber?: number;
        };
      }>;
    };
  }>;
  _mockSegments?: Array<{
    origin: string;
    destination: string;
    departure: string;
    arrival: string;
    carrier: string;
    flightNumber: string;
    stops: number;
    durationMinutes: number;
  }>;
  _mockOfferId?: string;
  _mockRefundable?: boolean;
};

type SabreGir = {
  scheduleDescs?: SabreScheduleDesc[];
  legDescs?: SabreLegDesc[];
  itineraryGroups?: Array<{
    groupDescription?: {
      legDescriptions?: Array<{ departureDate?: string }>;
    };
    itineraries?: SabreItinerary[];
  }>;
};

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function buildDateTime(date: string, time: string, dateAdjustment = 0): string {
  const normalizedTime = time.length === 8 ? time : `${time}:00`;
  const baseDate = dateAdjustment ? addDays(date, dateAdjustment) : date;
  return `${baseDate}T${normalizedTime.replace("+1", "")}`;
}

function resolveSabreSegments(
  itinerary: SabreItinerary,
  gir: SabreGir,
  legDates: string[],
): Array<{
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  carrier: string;
  flightNumber: string;
  stops: number;
  durationMinutes: number;
}> {
  if (itinerary._mockSegments?.length) {
    return itinerary._mockSegments;
  }

  const scheduleById = new Map((gir.scheduleDescs ?? []).map((schedule) => [schedule.id, schedule]));
  const legById = new Map((gir.legDescs ?? []).map((leg) => [leg.id, leg]));
  const segments: ReturnType<typeof resolveSabreSegments> = [];

  for (const [legIndex, leg] of (itinerary.legs ?? []).entries()) {
    const legDate = legDates[legIndex] ?? legDates[0] ?? "";
    const scheduleRefs = leg.schedules ?? legById.get(leg.ref)?.schedules ?? [];

    for (const scheduleRef of scheduleRefs) {
      const schedule = scheduleById.get(scheduleRef.ref);
      if (!schedule) continue;

      segments.push({
        origin: schedule.departure?.airport ?? "",
        destination: schedule.arrival?.airport ?? "",
        departure: buildDateTime(legDate, schedule.departure?.time ?? "00:00:00"),
        arrival: buildDateTime(
          legDate,
          schedule.arrival?.time ?? "00:00:00",
          schedule.arrival?.dateAdjustment ?? 0,
        ),
        carrier: schedule.carrier?.marketing ?? "",
        flightNumber: String(schedule.carrier?.marketingFlightNumber ?? ""),
        stops: schedule.stopCount ?? 0,
        durationMinutes: schedule.elapsedTime ?? 0,
      });
    }
  }

  return segments;
}

type SabreOtaFlightSegment = {
  DepartureDateTime?: string;
  ArrivalDateTime?: string;
  StopQuantity?: number;
  FlightNumber?: string;
  ElapsedTime?: number;
  DepartureAirport?: { LocationCode?: string };
  ArrivalAirport?: { LocationCode?: string };
  OperatingAirline?: { Code?: string; FlightNumber?: string };
  MarketingAirline?: { Code?: string };
};

type SabreOtaPricedItinerary = {
  SequenceNumber?: number;
  AirItinerary?: {
    OriginDestinationOptions?: {
      OriginDestinationOption?: Array<{
        FlightSegment?: SabreOtaFlightSegment | SabreOtaFlightSegment[];
      }>;
    };
  };
  AirItineraryPricingInfo?: Array<{
    ItinTotalFare?: {
      TotalFare?: { Amount?: number; CurrencyCode?: string };
    };
    PTC_FareBreakdowns?: {
      PTC_FareBreakdown?: Array<{
        PassengerTypeQuantity?: { Quantity?: number };
        Endorsements?: { NonRefundableIndicator?: boolean };
      }>;
    };
  }>;
  TPA_Extensions?: { ValidatingCarrier?: { Code?: string } };
  _mockOfferId?: string;
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeSabreOtaFlights(raw: unknown): UnifiedFlightOffer[] | null {
  const ota = (raw as { OTA_AirLowFareSearchRS?: { PricedItineraries?: { PricedItinerary?: SabreOtaPricedItinerary | SabreOtaPricedItinerary[] } } })
    .OTA_AirLowFareSearchRS;
  if (!ota) return null;

  const pricedItineraries = asArray(ota.PricedItineraries?.PricedItinerary);
  const offers: UnifiedFlightOffer[] = [];

  for (const itinerary of pricedItineraries) {
    const pricing = itinerary.AirItineraryPricingInfo?.[0];
    const totalFare = pricing?.ItinTotalFare?.TotalFare;
    const fareBreakdown = pricing?.PTC_FareBreakdowns?.PTC_FareBreakdown?.[0];
    const pax = fareBreakdown?.PassengerTypeQuantity?.Quantity ?? 1;
    const segments = asArray(itinerary.AirItinerary?.OriginDestinationOptions?.OriginDestinationOption)
      .flatMap((leg) => asArray(leg.FlightSegment))
      .map((segment) => ({
        origin: segment.DepartureAirport?.LocationCode ?? "",
        destination: segment.ArrivalAirport?.LocationCode ?? "",
        departure: segment.DepartureDateTime ?? "",
        arrival: segment.ArrivalDateTime ?? "",
        carrier:
          segment.MarketingAirline?.Code ??
          segment.OperatingAirline?.Code ??
          "",
        flightNumber: String(
          segment.FlightNumber ?? segment.OperatingAirline?.FlightNumber ?? "",
        ),
        stops: segment.StopQuantity ?? 0,
        durationMinutes: segment.ElapsedTime ?? 0,
      }));

    const validatingCarrier =
      itinerary.TPA_Extensions?.ValidatingCarrier?.Code ?? segments[0]?.carrier ?? "XX";

    offers.push({
      id:
        itinerary._mockOfferId ??
        `sabre-ota-${itinerary.SequenceNumber ?? offers.length + 1}`,
      provider: "sabre",
      totalPrice: totalFare?.Amount ?? 0,
      currency: totalFare?.CurrencyCode ?? "USD",
      perPassenger: roundMoney((totalFare?.Amount ?? 0) / pax),
      validatingCarrier,
      stops: segments.length ? Math.max(0, ...segments.map((segment) => segment.stops)) : 0,
      durationMinutes: segments.reduce((sum, segment) => sum + segment.durationMinutes, 0),
      segments: segments.map((segment) => ({
        origin: segment.origin,
        destination: segment.destination,
        departure: segment.departure,
        arrival: segment.arrival,
        carrier: segment.carrier,
        flightNumber: segment.flightNumber,
      })),
      refundable: fareBreakdown?.Endorsements?.NonRefundableIndicator !== true,
      raw: itinerary,
    });
  }

  return offers;
}

export function normalizeSabreFlights(raw: unknown): UnifiedFlightOffer[] {
  const otaOffers = normalizeSabreOtaFlights(raw);
  if (otaOffers !== null) return otaOffers;

  const gir = (raw as { groupedItineraryResponse?: SabreGir }).groupedItineraryResponse;
  if (!gir) return [];

  const offers: UnifiedFlightOffer[] = [];

  for (const group of gir.itineraryGroups ?? []) {
    const legDates =
      group.groupDescription?.legDescriptions?.map((leg) => leg.departureDate ?? "") ?? [];

    for (const itinerary of group.itineraries ?? []) {
      const fare = itinerary.pricingInformation?.[0]?.fare;
      const passengerInfo = fare?.passengerInfoList?.[0]?.passengerInfo;
      const totalPrice =
        fare?.totalFare?.totalPrice ?? passengerInfo?.passengerTotalFare?.totalFare ?? 0;
      const currency =
        fare?.totalFare?.currency ?? passengerInfo?.passengerTotalFare?.currency ?? "USD";
      const pax = passengerInfo?.passengerNumber ?? 1;
      const segments = resolveSabreSegments(itinerary, gir, legDates);
      const offerId = itinerary.pricingInformation?.[0]?.offer?.offerId;

      offers.push({
        id: itinerary._mockOfferId ?? offerId ?? `sabre-${itinerary.id}`,
        provider: "sabre",
        totalPrice,
        currency,
        perPassenger: roundMoney(totalPrice / pax),
        validatingCarrier: fare?.validatingCarrierCode ?? segments[0]?.carrier ?? "XX",
        stops: segments.length ? Math.max(0, ...segments.map((segment) => segment.stops)) : 0,
        durationMinutes: segments.reduce((sum, segment) => sum + segment.durationMinutes, 0),
        segments: segments.map((segment) => ({
          origin: segment.origin,
          destination: segment.destination,
          departure: segment.departure,
          arrival: segment.arrival,
          carrier: segment.carrier,
          flightNumber: segment.flightNumber,
        })),
        refundable: itinerary._mockRefundable ?? passengerInfo?.nonRefundable === false,
        raw: itinerary,
      });
    }
  }

  return offers;
}
