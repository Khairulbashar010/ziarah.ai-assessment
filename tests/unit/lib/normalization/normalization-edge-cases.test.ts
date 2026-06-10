import { describe, expect, it } from "vitest";
import { normalizeAmadeusFlights } from "@/lib/normalization/amadeus";
import { normalizeHotelBedsHotels } from "@/lib/normalization/hotelbeds";
import { normalizeSabreFlights } from "@/lib/normalization/sabre";

describe("normalizeAmadeusFlights edge cases", () => {
  it("returns an empty list when data is missing", () => {
    expect(normalizeAmadeusFlights({})).toEqual([]);
  });

  it("fills defaults for sparse offer payloads", () => {
    const [offer] = normalizeAmadeusFlights({
      data: [
        {
          itineraries: [
            {
              duration: "invalid",
              segments: [
                {
                  departure: { iataCode: "DXB", at: "2026-12-20T08:00:00" },
                  arrival: { iataCode: "LHR", at: "2026-12-20T14:00:00" },
                  carrierCode: "EK",
                  number: "1",
                  numberOfStops: 1,
                },
              ],
            },
            {
              duration: "PT7H30M",
              segments: [],
            },
          ],
        },
      ],
    });

    expect(offer.id).toMatch(/^amadeus-/);
    expect(offer.totalPrice).toBe(0);
    expect(offer.currency).toBe("USD");
    expect(offer.perPassenger).toBe(0);
    expect(offer.validatingCarrier).toBe("EK");
    expect(offer.stops).toBe(1);
    expect(offer.durationMinutes).toBe(450);
    expect(offer.segments[0]).toMatchObject({
      origin: "DXB",
      destination: "LHR",
      carrier: "EK",
      flightNumber: "1",
    });
  });
});

describe("normalizeHotelBedsHotels edge cases", () => {
  it("handles empty payloads and rate fallbacks", () => {
    expect(normalizeHotelBedsHotels({}, "2026-12-20", "2026-12-27")).toEqual([]);

    const [bookable, recheck] = normalizeHotelBedsHotels(
      {
        hotels: {
          hotels: [
            {
              code: 1,
              name: "Fallback Hotel",
              categoryName: "4 STARS",
              destinationCode: "LON",
              rooms: [
                {
                  name: "Double",
                  rates: [
                    {
                      rateKey: "bookable-key",
                      rateType: "BOOKABLE",
                      net: "400",
                      boardName: "Room only",
                    },
                    {
                      rateKey: "recheck-key",
                      rateType: "RECHECK",
                      net: "350",
                      sellingRate: "375",
                      currency: "GBP",
                      boardName: "Breakfast",
                      cancellationPolicies: [{ amount: "50", from: "2026-12-18" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      "2026-12-20",
      "2026-12-27",
    );

    expect(bookable.totalPrice).toBe(400);
    expect(bookable.currency).toBe("USD");
    expect(bookable.rateType).toBe("BOOKABLE");
    expect(recheck.totalPrice).toBe(375);
    expect(recheck.currency).toBe("GBP");
    expect(recheck.rateType).toBe("RECHECK");
    expect(recheck.cancellationPolicies).toHaveLength(1);
  });
});

describe("normalizeSabreFlights edge cases", () => {
  it("uses mock segments without resolving schedule descriptors", () => {
    const [offer] = normalizeSabreFlights({
      groupedItineraryResponse: {
        itineraryGroups: [
          {
            itineraries: [
              {
                id: 9,
                _mockSegments: [
                  {
                    origin: "DXB",
                    destination: "LHR",
                    departure: "2026-12-20T08:00:00",
                    arrival: "2026-12-20T14:00:00",
                    carrier: "EK",
                    flightNumber: "1",
                    stops: 0,
                    durationMinutes: 420,
                  },
                ],
                pricingInformation: [
                  {
                    fare: {
                      validatingCarrierCode: "EK",
                      totalFare: { totalPrice: 900, currency: "USD" },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(offer.segments[0].origin).toBe("DXB");
    expect(offer.totalPrice).toBe(900);
  });

  it("skips missing schedules and uses passenger fare fallbacks", () => {
    const [offer] = normalizeSabreFlights({
      groupedItineraryResponse: {
        itineraryGroups: [
          {
            groupDescription: { legDescriptions: [{ departureDate: "2026-12-20" }] },
            itineraries: [
              {
                id: 2,
                legs: [{ ref: 99, schedules: [{ ref: 404 }] }],
                _mockRefundable: true,
                pricingInformation: [
                  {
                    fare: {
                      passengerInfoList: [
                        {
                          passengerInfo: {
                            passengerNumber: 2,
                            nonRefundable: true,
                            passengerTotalFare: { totalFare: 500, currency: "EUR" },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
        scheduleDescs: [],
        legDescs: [{ id: 99, schedules: [{ ref: 404 }] }],
      },
    });

    expect(offer.totalPrice).toBe(500);
    expect(offer.currency).toBe("EUR");
    expect(offer.perPassenger).toBe(250);
    expect(offer.refundable).toBe(true);
    expect(offer.segments).toEqual([]);
    expect(offer.stops).toBe(0);
  });

  it("normalizes sparse OTA payloads with single segments and operating carrier fallback", () => {
    const [offer] = normalizeSabreFlights({
      OTA_AirLowFareSearchRS: {
        PricedItineraries: {
          PricedItinerary: {
            SequenceNumber: 7,
            AirItinerary: {
              OriginDestinationOptions: {
                OriginDestinationOption: {
                  FlightSegment: {
                    DepartureAirport: { LocationCode: "DXB" },
                    ArrivalAirport: { LocationCode: "LHR" },
                    DepartureDateTime: "2026-12-20T08:00:00",
                    ArrivalDateTime: "2026-12-20T14:00:00",
                    OperatingAirline: { Code: "EK", FlightNumber: "15" },
                    StopQuantity: 0,
                    ElapsedTime: 360,
                  },
                },
              },
            },
            AirItineraryPricingInfo: [
              {
                ItinTotalFare: { TotalFare: { Amount: 1200, CurrencyCode: "USD" } },
                PTC_FareBreakdowns: {
                  PTC_FareBreakdown: [
                    {
                      PassengerTypeQuantity: { Quantity: 2 },
                      Endorsements: { NonRefundableIndicator: true },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });

    expect(offer.id).toBe("sabre-ota-7");
    expect(offer.validatingCarrier).toBe("EK");
    expect(offer.refundable).toBe(false);
    expect(offer.segments[0].flightNumber).toBe("15");
  });

  it("returns an empty list for unknown payloads", () => {
    expect(normalizeSabreFlights({ unknown: true })).toEqual([]);
  });

  it("resolves GIR schedules via leg descriptors with date adjustments", () => {
    const [offer] = normalizeSabreFlights({
      groupedItineraryResponse: {
        itineraryGroups: [
          {
            groupDescription: { legDescriptions: [{ departureDate: "2026-12-20" }] },
            itineraries: [
              {
                id: 3,
                legs: [{ ref: 1 }],
                pricingInformation: [
                  {
                    offer: { offerId: "gir-offer-3" },
                    fare: {
                      validatingCarrierCode: "BA",
                      totalFare: { totalPrice: 999, currency: "USD" },
                    },
                  },
                ],
              },
            ],
          },
        ],
        scheduleDescs: [
          {
            id: 1,
            stopCount: 0,
            departure: { airport: "JFK", time: "20:50" },
            arrival: { airport: "LHR", time: "08:55", dateAdjustment: 1 },
            carrier: { marketing: "BA", marketingFlightNumber: 112 },
            elapsedTime: 425,
          },
        ],
        legDescs: [{ id: 1, schedules: [{ ref: 1 }] }],
      },
    });

    expect(offer.id).toBe("gir-offer-3");
    expect(offer.segments[0]).toMatchObject({
      origin: "JFK",
      destination: "LHR",
      carrier: "BA",
      flightNumber: "112",
    });
    expect(offer.segments[0].departure).toContain("2026-12-20T20:50:00");
    expect(offer.segments[0].arrival).toContain("2026-12-21");
  });
});
