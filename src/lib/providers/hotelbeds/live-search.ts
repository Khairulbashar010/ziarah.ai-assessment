import type { HotelSearchParams } from "@/lib/types/trip";
import { buildHotelBedsAuthHeaders, getHotelBedsBaseUrl } from "@/lib/providers/hotelbeds/auth";
import { resolveDestinationGeo } from "@/lib/providers/hotelbeds/destination-geo";

function buildOccupancies(params: HotelSearchParams) {
  return params.occupancies.map((occupancy) => {
    const base = {
      rooms: occupancy.rooms,
      adults: occupancy.adults,
      children: occupancy.children,
    };

    if (occupancy.children <= 0) {
      return base;
    }

    const ages =
      occupancy.childAges && occupancy.childAges.length >= occupancy.children
        ? occupancy.childAges.slice(0, occupancy.children)
        : Array.from({ length: occupancy.children }, (_, index) => 8 + index);

    return {
      ...base,
      paxes: ages.map((age) => ({ type: "CH", age })),
    };
  });
}

export async function searchHotelBedsHotelsLive(params: HotelSearchParams): Promise<unknown> {
  const geo = resolveDestinationGeo(params.destinationCode);
  const body = {
    stay: {
      checkIn: params.checkIn,
      checkOut: params.checkOut,
    },
    occupancies: buildOccupancies(params),
    geolocation: {
      latitude: geo.lat,
      longitude: geo.lng,
      radius: 30,
      unit: "km",
    },
  };

  const response = await fetch(`${getHotelBedsBaseUrl()}/hotel-api/1.0/hotels`, {
    method: "POST",
    headers: buildHotelBedsAuthHeaders(),
    body: JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? JSON.stringify((payload as { error: unknown }).error)
        : JSON.stringify(payload);
    throw new Error(`HotelBeds availability failed (${response.status}): ${message}`);
  }

  return payload;
}
