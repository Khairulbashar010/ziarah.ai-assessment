import type { FlightSearchParams } from "@/lib/types/trip";
import { buildAmadeusFlightOffersResponse } from "@/mocks/handlers/amadeus-flights";
import { runProviderClient } from "@/lib/providers/run-provider-client";

export function searchAmadeusFlights(params: FlightSearchParams): Promise<unknown> {
  return runProviderClient("Amadeus", "amadeus", params, {
    shouldError: (p) => p.origin === "ERR",
    errorMessage: "Amadeus validation error",
    shouldFail: (p) => p.origin === "ZZZ",
    failMessage: "Amadeus unavailable",
    mock: buildAmadeusFlightOffersResponse,
    live: async () => {
      throw new Error("Amadeus live integration unavailable — set MOCK_AMADEUS=true");
    },
  });
}
