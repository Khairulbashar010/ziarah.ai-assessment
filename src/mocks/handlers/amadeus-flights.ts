import type { FlightSearchParams } from "@/lib/types/trip";
import { resolveRouteSeed } from "@/mocks/seed/route-seed";
import type { RouteOffer, RouteSeed } from "@/mocks/seed/types";
import {
  fetchMockarooAmadeusSeeds,
  type MockarooAmadeusOfferSeed,
} from "@/lib/providers/amadeus/mockaroo";
import { roundMoney } from "@/lib/utils/money";

type AmadeusSegment = {
  departure: { iataCode: string; terminal?: string; at: string };
  arrival: { iataCode: string; at: string };
  carrierCode: string;
  number: string;
  aircraft: { code: string };
  operating: { carrierCode: string };
  duration: string;
  id: string;
  numberOfStops: number;
  blacklistedInEU: boolean;
};

type AmadeusItinerary = {
  duration: string;
  segments: AmadeusSegment[];
};

function passengerCount(params: FlightSearchParams) {
  return params.passengers.adults + params.passengers.children;
}

function durationIso(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `PT${hours}H${mins}M`;
}

function combineDateTime(date: string, time: string): string {
  const normalized = time.length === 5 ? `${time}:00` : time;
  return `${date}T${normalized}`;
}

function addMinutes(isoLocal: string, minutes: number): string {
  const [datePart, timePart] = isoLocal.split("T");
  const [hours, mins] = timePart.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  const nextHours = Math.floor(total / 60) % 24;
  const nextMins = total % 60;
  return `${datePart}T${String(nextHours).padStart(2, "0")}:${String(nextMins).padStart(2, "0")}:00`;
}

function localAmadeusSeeds(offers: RouteOffer[]): MockarooAmadeusOfferSeed[] {
  return offers.map((offer, index) => {
    const baseFarePerPax = roundMoney((350 + index * 40) * offer.priceMultiplier);
    return {
      carrier: offer.carrier,
      flightNumber: Number(offer.flightNumber),
      baseFarePerPax,
      taxPerPax: roundMoney(baseFarePerPax * 0.2),
      outboundElapsed: 300 + index * 45,
      returnElapsed: 320 + index * 40,
      stops: offer.stops,
      equipment: index % 2 === 0 ? "77W" : "359",
      bookableSeats: 9 - index,
    };
  });
}

function buildSegment(
  origin: string,
  destination: string,
  departureDate: string,
  departureTime: string,
  elapsedMinutes: number,
  carrier: string,
  flightNumber: string,
  stops: number,
  equipment: string,
  segmentId: string,
): AmadeusSegment {
  const departureAt = combineDateTime(departureDate, departureTime);
  const arrivalAt = addMinutes(departureAt, elapsedMinutes);

  return {
    departure: { iataCode: origin, at: departureAt },
    arrival: { iataCode: destination, at: arrivalAt },
    carrierCode: carrier,
    number: flightNumber,
    aircraft: { code: equipment },
    operating: { carrierCode: carrier },
    duration: durationIso(elapsedMinutes),
    id: segmentId,
    numberOfStops: stops,
    blacklistedInEU: false,
  };
}

function buildLegSegments(
  offer: RouteOffer,
  seed: MockarooAmadeusOfferSeed,
  departureDate: string,
  segmentIdStart: number,
  elapsedMinutes: number,
): AmadeusSegment[] {
  const segmentMinutes = Math.max(Math.floor(elapsedMinutes / (seed.stops + 1)), 90);

  if (seed.stops === 0) {
    return [
      buildSegment(
        offer.origin,
        offer.destination,
        departureDate,
        offer.departure,
        elapsedMinutes,
        seed.carrier,
        String(seed.flightNumber),
        0,
        seed.equipment,
        String(segmentIdStart),
      ),
    ];
  }

  return [
    buildSegment(
      offer.origin,
      "DOH",
      departureDate,
      offer.departure,
      segmentMinutes,
      seed.carrier,
      String(seed.flightNumber),
      0,
      seed.equipment,
      String(segmentIdStart),
    ),
    buildSegment(
      "DOH",
      offer.destination,
      departureDate,
      "19:30",
      segmentMinutes,
      seed.carrier,
      String(seed.flightNumber + 1),
      0,
      seed.equipment,
      String(segmentIdStart + 1),
    ),
  ];
}

function buildItinerary(segments: AmadeusSegment[]): AmadeusItinerary {
  const durationMinutes = segments.reduce((sum, segment) => {
    const match = segment.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return sum;
    return sum + Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  }, 0);

  return {
    duration: durationIso(durationMinutes),
    segments,
  };
}

function buildTravelerPricings(
  params: FlightSearchParams,
  segments: AmadeusSegment[],
  perTravelerTotal: number,
  perTravelerBase: number,
  currency: string,
) {
  const travelerTypes = [
    ...Array.from({ length: params.passengers.adults }, () => "ADULT" as const),
    ...Array.from({ length: params.passengers.children }, () => "CHILD" as const),
  ];

  return travelerTypes.map((travelerType, index) => ({
    travelerId: String(index + 1),
    fareOption: "STANDARD",
    travelerType,
    price: {
      currency,
      total: String(perTravelerTotal),
      base: String(perTravelerBase),
    },
    fareDetailsBySegment: segments.map((segment) => ({
      segmentId: segment.id,
      cabin: params.cabin,
      fareBasis: "VLGTOW",
      class: "V",
      includedCheckedBags: { quantity: 1 },
    })),
  }));
}

function buildFlightOffer(
  params: FlightSearchParams,
  offer: RouteOffer,
  seed: MockarooAmadeusOfferSeed,
  index: number,
) {
  const isRoundTrip = Boolean(params.returnDate);
  const pax = passengerCount(params);
  const perTravelerTotal = roundMoney(seed.baseFarePerPax + seed.taxPerPax);
  const total = roundMoney(perTravelerTotal * pax);
  const perTravelerBase = roundMoney(seed.baseFarePerPax);
  const currency = "USD";

  const outboundSegments = buildLegSegments(
    offer,
    seed,
    params.departureDate,
    1,
    Math.max(seed.outboundElapsed, 120),
  );

  const returnSegments = isRoundTrip
    ? buildLegSegments(
        {
          ...offer,
          origin: offer.destination,
          destination: offer.origin,
        },
        { ...seed, flightNumber: seed.flightNumber + 10 },
        params.returnDate!,
        outboundSegments.length + 1,
        Math.max(seed.returnElapsed, 120),
      )
    : [];

  const itineraries = [
    buildItinerary(outboundSegments),
    ...(returnSegments.length ? [buildItinerary(returnSegments)] : []),
  ];
  const allSegments = itineraries.flatMap((itinerary) => itinerary.segments);

  return {
    type: "flight-offer",
    id: String(index + 1),
    source: "GDS",
    instantTicketingRequired: false,
    nonHomogeneous: false,
    oneWay: !isRoundTrip,
    lastTicketingDate: params.departureDate,
    numberOfBookableSeats: seed.bookableSeats,
    itineraries,
    price: {
      currency,
      total: String(total),
      base: String(roundMoney(perTravelerBase * pax)),
      fees: [
        { amount: "0.00", type: "SUPPLIER" },
        { amount: "0.00", type: "TICKETING" },
      ],
      grandTotal: String(total),
    },
    pricingOptions: {
      fareType: ["PUBLISHED"],
      includedCheckedBagsOnly: true,
    },
    validatingAirlineCodes: [seed.carrier],
    travelerPricings: buildTravelerPricings(
      params,
      allSegments,
      perTravelerTotal,
      perTravelerBase,
      currency,
    ),
  };
}

function buildDictionaries(data: ReturnType<typeof buildFlightOffer>[]) {
  const locations: Record<string, { cityCode: string; countryCode: string }> = {};
  const carriers: Record<string, string> = {};
  const aircraft: Record<string, string> = {};

  for (const offer of data) {
    for (const itinerary of offer.itineraries) {
      for (const segment of itinerary.segments) {
        locations[segment.departure.iataCode] = {
          cityCode: segment.departure.iataCode,
          countryCode: "XX",
        };
        locations[segment.arrival.iataCode] = {
          cityCode: segment.arrival.iataCode,
          countryCode: "XX",
        };
        carriers[segment.carrierCode] = segment.carrierCode;
        aircraft[segment.aircraft.code] = segment.aircraft.code;
      }
    }
  }

  return {
    locations,
    aircraft,
    currencies: { USD: "US DOLLAR" },
    carriers,
  };
}

export async function buildAmadeusFlightOffersResponse(params: FlightSearchParams) {
  const seedRoute = resolveRouteSeed(params.origin, params.destination);

  if (!seedRoute) {
    return { meta: { count: 0 }, data: [] };
  }

  const mockarooSeeds =
    (await fetchMockarooAmadeusSeeds(seedRoute.offers.length)) ??
    localAmadeusSeeds(seedRoute.offers);

  const data = seedRoute.offers.map((offer, index) => {
    const seed = {
      ...mockarooSeeds[index % mockarooSeeds.length],
      carrier: offer.carrier,
      flightNumber: Number(offer.flightNumber),
      stops: offer.stops,
    };
    return buildFlightOffer(params, offer, seed, index);
  });

  return {
    meta: {
      count: data.length,
      links: {
        self: `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${params.origin}&destinationLocationCode=${params.destination}&departureDate=${params.departureDate}${params.returnDate ? `&returnDate=${params.returnDate}` : ""}&adults=${params.passengers.adults}`,
      },
    },
    data,
    dictionaries: buildDictionaries(data),
  };
}
