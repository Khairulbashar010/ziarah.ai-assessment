import { describe, it, expect } from "vitest";
import { normalizeSabreFlights } from "@/lib/normalization/sabre";

const girFixture = {
  groupedItineraryResponse: {
    version: "4.3.0",
    itineraryGroups: [
      {
        groupDescription: {
          legDescriptions: [{ departureDate: "2026-07-15" }],
        },
        itineraries: [
          {
            id: 1,
            legs: [{ ref: 1, schedules: [{ ref: 1 }] }],
            pricingInformation: [
              {
                offer: { offerId: "sabre-live-offer-001" },
                fare: {
                  validatingCarrierCode: "BA",
                  totalFare: { totalPrice: 687.4, currency: "USD" },
                  passengerInfoList: [
                    {
                      passengerInfo: {
                        passengerNumber: 1,
                        nonRefundable: true,
                        passengerTotalFare: { totalFare: 687.4, currency: "USD" },
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
    scheduleDescs: [
      {
        id: 1,
        stopCount: 0,
        departure: { airport: "JFK", time: "20:50:00" },
        arrival: { airport: "LHR", time: "08:55:00", dateAdjustment: 1 },
        carrier: { marketing: "BA", marketingFlightNumber: 112 },
        elapsedTime: 425,
      },
    ],
    legDescs: [{ id: 1, schedules: [{ ref: 1 }] }],
  },
};

describe("normalizeSabreFlights live GIR", () => {
  it("resolves scheduleDescs into unified segments", () => {
    const offers = normalizeSabreFlights(girFixture);

    expect(offers).toHaveLength(1);
    expect(offers[0].id).toBe("sabre-live-offer-001");
    expect(offers[0].segments[0]).toMatchObject({
      origin: "JFK",
      destination: "LHR",
      carrier: "BA",
      flightNumber: "112",
    });
    expect(offers[0].totalPrice).toBe(687.4);
  });
});
