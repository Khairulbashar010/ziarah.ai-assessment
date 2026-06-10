import type { FlightSearchParams } from "@/lib/types/trip";
import { resolveRouteSeed } from "@/mocks/seed/route-seed";
import type { RouteOffer, RouteSeed } from "@/mocks/seed/types";
import {
  fetchMockarooSabreSeeds,
  type MockarooSabreItinerarySeed,
} from "@/lib/providers/sabre/mockaroo";
import { roundMoney } from "@/lib/utils/money";

type MoneyField = {
  Amount: number;
  CurrencyCode: string;
  DecimalPlaces?: number;
};

type FlightSegment = {
  DepartureDateTime: string;
  ArrivalDateTime: string;
  StopQuantity: number;
  FlightNumber: string;
  ResBookDesigCode: string;
  ElapsedTime: number;
  DepartureAirport: { LocationCode: string; TerminalID?: string; content: string };
  ArrivalAirport: { LocationCode: string; TerminalID?: string; content: string };
  OperatingAirline: { Code: string; FlightNumber: string; content: string };
  Equipment: Array<{ AirEquipType: string; content: string }>;
  MarketingAirline: { Code: string; content: string };
  MarriageGrp: string;
  DepartureTimeZone: { GMTOffset: number };
  ArrivalTimeZone: { GMTOffset: number };
  OnTimePerformance: { Level: string };
  TPA_Extensions: {
    eTicket: { Ind: boolean };
    Mileage: { Amount: number };
  };
};

function passengerCount(params: FlightSearchParams) {
  return params.passengers.adults + params.passengers.children + params.passengers.infants;
}

function localSabreSeeds(params: FlightSearchParams, offers: RouteOffer[]): MockarooSabreItinerarySeed[] {
  return offers.map((offer, index) => {
    const multiplier = offer.priceMultiplier;
    const baseFarePerPax = roundMoney((350 + index * 40) * multiplier);
    return {
      carrier: offer.carrier,
      flightNumber: Number(offer.flightNumber),
      baseFarePerPax,
      taxPerPax: roundMoney(baseFarePerPax * 0.2),
      outboundElapsed: 300 + index * 45,
      returnElapsed: 320 + index * 40,
      stops: offer.stops,
      equipment: index % 2 === 0 ? "738" : "321",
    };
  });
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

function buildSegment(
  origin: string,
  destination: string,
  departureDate: string,
  departureTime: string,
  arrivalTime: string,
  carrier: string,
  flightNumber: string,
  elapsedTime: number,
  stops: number,
  equipment: string,
  marriageGrp: "O" | "I" = "O",
): FlightSegment {
  const departureDateTime = combineDateTime(departureDate, departureTime);
  const arrivalDateTime = addMinutes(departureDateTime, elapsedTime);

  return {
    DepartureDateTime: departureDateTime,
    ArrivalDateTime: arrivalDateTime,
    StopQuantity: stops,
    FlightNumber: flightNumber,
    ResBookDesigCode: stops === 0 ? "S" : "Q",
    ElapsedTime: elapsedTime,
    DepartureAirport: { LocationCode: origin, TerminalID: "0", content: "" },
    ArrivalAirport: { LocationCode: destination, TerminalID: "0", content: "" },
    OperatingAirline: { Code: carrier, FlightNumber: flightNumber, content: "" },
    Equipment: [{ AirEquipType: equipment, content: "" }],
    MarketingAirline: { Code: carrier, content: "" },
    MarriageGrp: marriageGrp,
    DepartureTimeZone: { GMTOffset: -5 },
    ArrivalTimeZone: { GMTOffset: -6 },
    OnTimePerformance: { Level: String(6 + (Number(flightNumber) % 4)) },
    TPA_Extensions: {
      eTicket: { Ind: true },
      Mileage: { Amount: 700 + elapsedTime },
    },
  };
}

function money(amount: number): MoneyField {
  return { Amount: roundMoney(amount), CurrencyCode: "USD", DecimalPlaces: 2 };
}

function buildPricedItinerary(
  params: FlightSearchParams,
  offer: RouteOffer,
  seed: MockarooSabreItinerarySeed,
  sequenceNumber: number,
) {
  const pax = passengerCount(params);
  const baseFarePerPax = seed.baseFarePerPax;
  const taxPerPax = seed.taxPerPax;
  const totalPerPax = roundMoney(baseFarePerPax + taxPerPax);
  const totalFare = roundMoney(totalPerPax * pax);
  const baseFare = roundMoney(baseFarePerPax * pax);
  const totalTax = roundMoney(taxPerPax * pax);
  const outboundMinutes = Math.max(seed.outboundElapsed, 120);
  const returnMinutes = params.returnDate ? Math.max(seed.returnElapsed, 120) : 0;
  const outboundSegmentMinutes = Math.floor(outboundMinutes / (seed.stops + 1));
  const returnSegmentMinutes = returnMinutes
    ? Math.floor(returnMinutes / (seed.stops + 1))
    : 0;

  const outboundSegments: FlightSegment[] =
    seed.stops === 0
      ? [
          buildSegment(
            offer.origin,
            offer.destination,
            params.departureDate,
            offer.departure,
            offer.arrival,
            seed.carrier,
            String(seed.flightNumber),
            outboundMinutes,
            0,
            seed.equipment,
          ),
        ]
      : [
          buildSegment(
            offer.origin,
            "ORD",
            params.departureDate,
            offer.departure,
            "19:09",
            seed.carrier,
            String(seed.flightNumber),
            outboundSegmentMinutes,
            0,
            seed.equipment,
          ),
          buildSegment(
            "ORD",
            offer.destination,
            params.departureDate,
            "20:18",
            offer.arrival,
            seed.carrier,
            String(seed.flightNumber + 1),
            outboundSegmentMinutes,
            0,
            seed.equipment,
          ),
        ];

  const returnDate = params.returnDate ?? params.departureDate;
  const returnSegments: FlightSegment[] = params.returnDate
    ? seed.stops === 0
      ? [
          buildSegment(
            offer.destination,
            offer.origin,
            returnDate,
            offer.departure,
            offer.arrival,
            seed.carrier,
            String(seed.flightNumber + 2),
            returnMinutes,
            0,
            seed.equipment,
            "I",
          ),
        ]
      : [
          buildSegment(
            offer.destination,
            "MCO",
            returnDate,
            "21:30",
            "05:15",
            seed.carrier,
            String(seed.flightNumber + 2),
            returnSegmentMinutes,
            0,
            seed.equipment,
          ),
          buildSegment(
            "MCO",
            offer.origin,
            returnDate,
            "09:40",
            offer.arrival,
            seed.carrier,
            String(seed.flightNumber + 3),
            returnSegmentMinutes,
            0,
            seed.equipment,
            "I",
          ),
        ]
    : [];

  const originDestinationOptions = [
    {
      ElapsedTime: outboundMinutes,
      FlightSegment: outboundSegments,
    },
    ...(returnSegments.length
      ? [
          {
            ElapsedTime: returnMinutes,
            FlightSegment: returnSegments,
          },
        ]
      : []),
  ];

  return {
    SequenceNumber: sequenceNumber,
    AirItinerary: {
      DirectionInd: params.returnDate ? "Return" : "OneWay",
      OriginDestinationOptions: {
        OriginDestinationOption: originDestinationOptions,
      },
    },
    AirItineraryPricingInfo: [
      {
        LastTicketDate: params.departureDate,
        PricingSource: "ADVJR1",
        PricingSubSource: "MIP",
        FareReturned: true,
        ItinTotalFare: {
          BaseFare: money(baseFare),
          FareConstruction: money(baseFare),
          EquivFare: money(baseFare),
          Taxes: {
            Tax: [{ TaxCode: "TOTALTAX", ...money(totalTax), content: "" }],
          },
          TotalFare: money(totalFare),
        },
        PTC_FareBreakdowns: {
          PTC_FareBreakdown: [
            {
              PassengerTypeQuantity: {
                Code: "ADT",
                Quantity: pax,
              },
              FareBasisCodes: {
                FareBasisCode: outboundSegments.map((segment, index) => ({
                  BookingCode: segment.ResBookDesigCode,
                  AvailabilityBreak: index === 0,
                  DepartureAirportCode: segment.DepartureAirport.LocationCode,
                  ArrivalAirportCode: segment.ArrivalAirport.LocationCode,
                  FareComponentBeginAirport: segment.DepartureAirport.LocationCode,
                  FareComponentEndAirport: segment.ArrivalAirport.LocationCode,
                  FareComponentDirectionality: "FROM",
                  FareComponentVendorCode: "ATP",
                  GovCarrier: seed.carrier,
                  content: `${segment.ResBookDesigCode}0AJZNN1`,
                })),
              },
              PassengerFare: {
                BaseFare: { Amount: baseFarePerPax, CurrencyCode: "USD" },
                FareConstruction: money(baseFarePerPax),
                EquivFare: money(baseFarePerPax),
                Taxes: {
                  Tax: [
                    {
                      TaxCode: "US1",
                      CountryCode: "US",
                      Amount: roundMoney(taxPerPax * 0.35),
                      CurrencyCode: "USD",
                      DecimalPlaces: 2,
                      content: "",
                    },
                  ],
                  TaxSummary: [
                    {
                      TaxCode: "US1",
                      CountryCode: "US",
                      Amount: roundMoney(taxPerPax * 0.35),
                      CurrencyCode: "USD",
                      DecimalPlaces: 2,
                      content: "",
                    },
                  ],
                  TotalTax: money(taxPerPax),
                },
                TotalFare: { Amount: totalPerPax, CurrencyCode: "USD" },
                TPA_Extensions: {
                  Messages: {
                    Message: [
                      {
                        AirlineCode: seed.carrier,
                        Type: "N",
                        FailCode: 0,
                        Info: "NONREF/SVCCHGPLUSFAREDIF/CXL BY FLT TIME OR NOVALUE",
                      },
                      {
                        Type: "W",
                        FailCode: 0,
                        Info: `VALIDATING CARRIER - ${seed.carrier}`,
                      },
                    ],
                  },
                  BaggageInformationList: {
                    BaggageInformation: [
                      {
                        ProvisionType: "A",
                        AirlineCode: seed.carrier,
                        Segment: outboundSegments.map((_, index) => ({ Id: index })),
                        Allowance: [{ Pieces: 0 }],
                      },
                    ],
                  },
                },
              },
              Endorsements: {
                NonRefundableIndicator: offer.stops > 0,
              },
              TPA_Extensions: {
                FareCalcLine: {
                  Info: `${offer.origin} ${seed.carrier} ${offer.destination} USD${baseFarePerPax}END`,
                },
              },
              FareInfos: {
                FareInfo: outboundSegments.map((segment) => ({
                  FareReference: segment.ResBookDesigCode,
                  TPA_Extensions: {
                    SeatsRemaining: { Number: 9, BelowMin: false },
                    Cabin: { Cabin: "Y" },
                    Meal: { Code: "R" },
                  },
                })),
              },
            },
          ],
        },
        FareInfos: {
          FareInfo: outboundSegments.map((segment) => ({
            FareReference: segment.ResBookDesigCode,
            TPA_Extensions: {
              SeatsRemaining: { Number: 9, BelowMin: false },
              Cabin: { Cabin: "Y" },
              Meal: { Code: "R" },
            },
          })),
        },
        TPA_Extensions: {
          DivideInParty: { Indicator: false },
          ValidatingCarrier: [
            {
              SettlementMethod: "ARC",
              NewVcxProcess: true,
              Default: { Code: seed.carrier },
            },
          ],
        },
      },
    ],
    TicketingInfo: {
      TicketType: "eTicket",
      ValidInterline: "Yes",
    },
    TPA_Extensions: {
      ValidatingCarrier: { Code: seed.carrier },
    },
    _mockOfferId: `sabre-mock-offer-${String(sequenceNumber).padStart(3, "0")}`,
  };
}

function emptySabreOtaResponse() {
  return {
    OTA_AirLowFareSearchRS: {
      PricedItinCount: 0,
      BrandedOneWayItinCount: 0,
      SimpleOneWayItinCount: 0,
      DepartedItinCount: 0,
      SoldOutItinCount: 0,
      AvailableItinCount: 0,
      Version: "3.3.0",
      Success: {},
      Warnings: { Warning: [] },
      PricedItineraries: { PricedItinerary: [] },
    },
    Links: [
      {
        rel: "self",
        href: "https://api.test.sabre.com/v3.3.0/shop/flights?mode=live&limit=50&offset=1",
      },
      {
        rel: "linkTemplate",
        href: "https://api.test.sabre.com/<version>/shop/flights?mode=<mode>&limit=<limit>&offset=<offset>&enabletagging=<enabletagging>",
      },
    ],
  };
}

export async function buildSabreOtaResponse(params: FlightSearchParams) {
  const seedRoute = resolveRouteSeed(params.origin, params.destination);

  if (!seedRoute) {
    return emptySabreOtaResponse();
  }

  const mockarooSeeds =
    (await fetchMockarooSabreSeeds(seedRoute.offers.length)) ??
    localSabreSeeds(params, seedRoute.offers);

  const pricedItineraries = seedRoute.offers.map((offer, index) => {
    const seed = {
      ...mockarooSeeds[index % mockarooSeeds.length],
      carrier: offer.carrier,
      flightNumber: Number(offer.flightNumber),
      stops: offer.stops,
    };
    return buildPricedItinerary(params, offer, seed, index + 1);
  });

  return {
    OTA_AirLowFareSearchRS: {
      PricedItinCount: pricedItineraries.length,
      BrandedOneWayItinCount: 0,
      SimpleOneWayItinCount: 0,
      DepartedItinCount: 0,
      SoldOutItinCount: 0,
      AvailableItinCount: 0,
      Version: "3.3.0",
      Success: {},
      Warnings: {
        Warning: [
          {
            Type: "WORKERTHREAD",
            ShortText: "2918950309412236714",
            Code: "TRANSACTIONID",
            MessageClass: "I",
            content: "",
          },
          {
            Type: "SERVER",
            ShortText: "27032",
            Code: "TTFHLC850",
            MessageClass: "I",
            content: "",
          },
        ],
      },
      PricedItineraries: {
        PricedItinerary: pricedItineraries,
      },
    },
    Links: [
      {
        rel: "self",
        href: "https://api.test.sabre.com/v3.3.0/shop/flights?mode=live&limit=50&offset=1",
      },
      {
        rel: "linkTemplate",
        href: "https://api.test.sabre.com/<version>/shop/flights?mode=<mode>&limit=<limit>&offset=<offset>&enabletagging=<enabletagging>",
      },
    ],
  };
}
