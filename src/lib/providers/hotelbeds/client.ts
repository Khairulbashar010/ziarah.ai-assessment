import type { HotelSearchParams } from "@/lib/types/trip";
import { buildHotelBedsAvailabilityResponse } from "@/mocks/handlers/hotelbeds-availability";
import { runProviderClient } from "@/lib/providers/run-provider-client";
import { searchHotelBedsHotelsLive } from "@/lib/providers/hotelbeds/live-search";

export function searchHotelBedsHotels(params: HotelSearchParams): Promise<unknown> {
  return runProviderClient("HotelBeds", "hotelbeds", params, {
    shouldError: (p) => p.destinationCode === "ERR",
    errorMessage: "HotelBeds validation error",
    shouldFail: (p) => p.destinationCode === "FAIL",
    failMessage: "HotelBeds unavailable",
    mock: buildHotelBedsAvailabilityResponse,
    live: searchHotelBedsHotelsLive,
  });
}
