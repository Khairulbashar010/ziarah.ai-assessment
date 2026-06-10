import type { FlightSearchParams } from "@/lib/types/trip";

const CABIN_CODES: Record<FlightSearchParams["cabin"], string> = {
  ECONOMY: "Y",
  PREMIUM_ECONOMY: "S",
  BUSINESS: "C",
  FIRST: "F",
};

export function buildSabreBfmRequest(params: FlightSearchParams, pcc: string) {
  const originDestinationInformation = [
    {
      RPH: "1",
      DepartureDateTime: `${params.departureDate}T00:00:00`,
      OriginLocation: { LocationCode: params.origin },
      DestinationLocation: { LocationCode: params.destination },
    },
  ];

  if (params.returnDate) {
    originDestinationInformation.push({
      RPH: "2",
      DepartureDateTime: `${params.returnDate}T00:00:00`,
      OriginLocation: { LocationCode: params.destination },
      DestinationLocation: { LocationCode: params.origin },
    });
  }

  const passengerTypeQuantity = [];
  if (params.passengers.adults > 0) {
    passengerTypeQuantity.push({ Code: "ADT", Quantity: params.passengers.adults });
  }
  if (params.passengers.children > 0) {
    passengerTypeQuantity.push({ Code: "CNN", Quantity: params.passengers.children });
  }
  if (params.passengers.infants > 0) {
    passengerTypeQuantity.push({ Code: "INF", Quantity: params.passengers.infants });
  }

  const seatsRequested =
    params.passengers.adults + params.passengers.children + params.passengers.infants;

  return {
    OTA_AirLowFareSearchRQ: {
      DirectFlightsOnly: params.nonStop ?? false,
      AvailableFlightsOnly: true,
      Version: "4.3.0",
      POS: {
        Source: [
          {
            PseudoCityCode: pcc,
            RequestorID: {
              Type: "1",
              ID: "1",
              CompanyName: { Code: "TN", content: "TN" },
            },
          },
        ],
      },
      OriginDestinationInformation: originDestinationInformation,
      TravelerInfoSummary: {
        SeatsRequested: [seatsRequested],
        AirTravelerAvail: [{ PassengerTypeQuantity: passengerTypeQuantity }],
      },
      TravelPreferences: {
        CabinPref: [{ Cabin: CABIN_CODES[params.cabin], PreferLevel: "Preferred" }],
      },
      TPA_Extensions: {
        IntelliSellTransaction: {
          RequestType: { Name: "50ITINS" },
        },
      },
    },
  };
}
