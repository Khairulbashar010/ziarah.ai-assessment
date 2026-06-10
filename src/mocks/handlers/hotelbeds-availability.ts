import type { HotelSearchParams } from "@/lib/types/trip";
import { resolveHotelsForDestination } from "@/mocks/seed/hotel-seed";
import type { HotelSeed } from "@/mocks/seed/types";
import {
  fetchMockarooHotelbedsSeeds,
  type MockarooHotelbedsRateSeed,
} from "@/lib/providers/hotelbeds/mockaroo";
import { nightsBetween } from "@/lib/utils/dates";
import { roundMoney } from "@/lib/utils/money";

const DESTINATION_NAMES: Record<string, string> = {
  LON: "London",
  PMI: "Majorca",
  DXB: "Dubai",
  BKK: "Bangkok",
};

const BOARD_NAMES: Record<MockarooHotelbedsRateSeed["boardCode"], string> = {
  BB: "BED AND BREAKFAST",
  RO: "ROOM ONLY",
  HB: "HALF BOARD",
};

function categoryCode(category: string) {
  return category.replace(" STARS", "EST").replace(" ", "");
}

function occupancyFactor(params: HotelSearchParams) {
  const occupancy = params.occupancies[0] ?? { rooms: 1, adults: 2, children: 0 };
  return {
    occupancy,
    roomFactor: occupancy.rooms + occupancy.children * 0.3,
  };
}

function localHotelbedsSeeds(matching: HotelSeed[]): MockarooHotelbedsRateSeed[] {
  return matching.map((hotel, index) => ({
    nightlyNet: hotel.pricePerNight,
    taxPerNight: roundMoney(hotel.pricePerNight * 0.12),
    allotment: Math.max(3, 12 - index),
    exclusiveDeal: index % 4,
    boardCode: index % 3 === 0 ? "BB" : index % 3 === 1 ? "RO" : "HB",
    rateType: index === 0 ? "RECHECK" : "BOOKABLE",
    zoneCode: 60 + index,
  }));
}

function buildRateKey(
  params: HotelSearchParams,
  hotelCode: number,
  boardCode: string,
  ratePlan: string,
  index: number,
) {
  const { occupancy } = occupancyFactor(params);
  const checkIn = params.checkIn.replace(/-/g, "");
  const checkOut = params.checkOut.replace(/-/g, "");
  return `${checkIn}|${checkOut}|W|59|${hotelCode}|DBL.ST|${ratePlan}|${boardCode}||${occupancy.rooms}~${occupancy.adults}~${occupancy.children}||N@05~~mock~${hotelCode}~${boardCode}~~~MOCK${String(index + 1).padStart(3, "0")}`;
}

function buildRate(
  params: HotelSearchParams,
  hotel: HotelSeed,
  seed: MockarooHotelbedsRateSeed,
  nights: number,
  roomFactor: number,
  rateType: "BOOKABLE" | "RECHECK",
  netTotal: number,
  taxTotal: number,
  ratePlan: string,
  index: number,
) {
  const { occupancy } = occupancyFactor(params);
  const nightlyNet = roundMoney(netTotal / nights);
  const sellingRate =
    rateType === "BOOKABLE" ? String(roundMoney(netTotal * 1.08)) : undefined;

  return {
    rateKey: buildRateKey(params, hotel.code, seed.boardCode, ratePlan, index),
    rateClass: "NOR",
    rateType,
    net: String(netTotal),
    ...(sellingRate ? { sellingRate } : {}),
    hotelMandatory: rateType === "BOOKABLE" && seed.exclusiveDeal > 0,
    allotment: seed.allotment,
    paymentType: "AT_WEB",
    packaging: false,
    boardCode: seed.boardCode,
    boardName: BOARD_NAMES[seed.boardCode],
    cancellationPolicies: [
      {
        amount: String(nightlyNet),
        from: `${params.checkIn}T23:59:00+01:00`,
      },
    ],
    taxes: {
      taxes: [
        {
          included: true,
          amount: String(roundMoney(taxTotal)),
          currency: "USD",
          type: "TAXESANDFEES",
        },
      ],
      allIncluded: true,
    },
    rooms: occupancy.rooms,
    adults: occupancy.adults,
    children: occupancy.children,
  };
}

function buildHotel(
  params: HotelSearchParams,
  hotel: HotelSeed,
  seed: MockarooHotelbedsRateSeed,
  index: number,
) {
  const nights = nightsBetween(params.checkIn, params.checkOut);
  const { roomFactor } = occupancyFactor(params);
  const netTotal = roundMoney(seed.nightlyNet * nights * roomFactor);
  const taxTotal = roundMoney(seed.taxPerNight * nights * roomFactor);
  const bookableTotal = roundMoney(netTotal * 1.06);

  const rates = [
    buildRate(
      params,
      hotel,
      seed,
      nights,
      roomFactor,
      seed.rateType,
      netTotal,
      taxTotal,
      seed.rateType === "RECHECK" ? "ID_B2B_26" : "CGW-BAR-BB",
      index,
    ),
  ];

  if (seed.rateType === "RECHECK") {
    rates.push(
      buildRate(
        params,
        hotel,
        { ...seed, boardCode: "BB" },
        nights,
        roomFactor,
        "BOOKABLE",
        bookableTotal,
        taxTotal,
        "CGW-BAR-BB",
        index,
      ),
    );
  }

  const rateTotals = rates.map((rate) => Number(rate.net));
  const minRate = String(Math.min(...rateTotals));
  const maxRate = String(Math.max(...rateTotals.map((net) => net * 1.08)));

  return {
    code: hotel.code,
    name: hotel.name,
    exclusiveDeal: seed.exclusiveDeal,
    categoryCode: categoryCode(hotel.category),
    categoryName: hotel.category,
    destinationCode: hotel.destinationCode,
    destinationName: DESTINATION_NAMES[hotel.destinationCode] ?? hotel.destinationCode,
    zoneCode: seed.zoneCode,
    zoneName: DESTINATION_NAMES[hotel.destinationCode] ?? "Central",
    latitude: String(hotel.lat),
    longitude: String(hotel.lng),
    currency: "USD",
    minRate,
    maxRate,
    rooms: [
      {
        code: "DBL.ST",
        name: "DOUBLE STANDARD",
        rates,
      },
    ],
  };
}

export async function buildHotelBedsAvailabilityResponse(params: HotelSearchParams) {
  const matching = resolveHotelsForDestination(params.destinationCode);

  if (matching.length === 0) {
    return {
      auditData: {
        processTime: "12",
        timestamp: new Date().toISOString(),
        requestHost: "mock",
        serverId: "mock-server-01",
        environment: "TEST",
      },
      hotels: {
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        total: 0,
        hotels: [],
      },
    };
  }

  const mockarooSeeds =
    (await fetchMockarooHotelbedsSeeds(matching.length)) ?? localHotelbedsSeeds(matching);

  const hotelList = matching.map((hotel, index) => {
    const seed = {
      ...mockarooSeeds[index % mockarooSeeds.length],
      nightlyNet: roundMoney(
        (mockarooSeeds[index % mockarooSeeds.length].nightlyNet * hotel.pricePerNight) /
          150,
      ),
    };
    return buildHotel(params, hotel, seed, index);
  });

  return {
    auditData: {
      processTime: String(40 + hotelList.length * 18),
      timestamp: new Date().toISOString(),
      requestHost: "mock",
      serverId: "mock-server-01",
      environment: "TEST",
    },
    hotels: {
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      total: hotelList.length,
      hotels: hotelList,
    },
  };
}
