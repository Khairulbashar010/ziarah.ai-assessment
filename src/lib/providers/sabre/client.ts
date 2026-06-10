import type { FlightSearchParams } from "@/lib/types/trip";
import { buildSabreOtaResponse } from "@/mocks/handlers/sabre-ota-bfm";
import { runProviderClient } from "@/lib/providers/run-provider-client";
import { searchSabreFlightsLive } from "@/lib/providers/sabre/live-search";

export function searchSabreFlights(params: FlightSearchParams): Promise<unknown> {
  return runProviderClient("Sabre", "sabre", params, {
    shouldError: (p) => p.origin === "ERR",
    errorMessage: "Sabre validation error",
    shouldFail: (p) => p.origin === "ZZZ",
    failMessage: "Sabre unavailable",
    mock: buildSabreOtaResponse,
    live: searchSabreFlightsLive,
  });
}
