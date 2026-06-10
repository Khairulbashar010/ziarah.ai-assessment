import type { UnifiedFlightOffer } from "@/lib/types/trip";
import { roundMoney } from "@/lib/utils/money";

type AmadeusSegment = {
  departure?: { iataCode?: string; at?: string };
  arrival?: { iataCode?: string; at?: string };
  carrierCode?: string;
  number?: string;
  numberOfStops?: number;
};

type AmadeusOffer = {
  id?: string;
  price?: { total?: string; currency?: string };
  validatingAirlineCodes?: string[];
  itineraries: Array<{ segments: AmadeusSegment[]; duration?: string }>;
  travelerPricings?: Array<{ travelerType?: string }>;
};

function parseDurationMinutes(iso?: string): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

export function normalizeAmadeusFlights(raw: unknown): UnifiedFlightOffer[] {
  const offers = (raw as { data?: AmadeusOffer[] }).data ?? [];

  return offers.map((offer) => {
    const segments = offer.itineraries.flatMap((it) => it.segments);
    const totalPrice = Number(offer.price?.total ?? 0);
    const currency = offer.price?.currency ?? "USD";
    const travelerCount = offer.travelerPricings?.length ?? 1;
    const durationMinutes = offer.itineraries.reduce(
      (sum, it) => sum + parseDurationMinutes(it.duration),
      0,
    );

    return {
      id: offer.id ?? `amadeus-${Math.random()}`,
      provider: "amadeus" as const,
      totalPrice,
      currency,
      perPassenger: roundMoney(totalPrice / travelerCount),
      validatingCarrier: offer.validatingAirlineCodes?.[0] ?? segments[0]?.carrierCode ?? "XX",
      stops: Math.max(0, ...segments.map((s) => s.numberOfStops ?? 0)),
      durationMinutes,
      segments: segments.map((s) => ({
        origin: s.departure?.iataCode ?? "",
        destination: s.arrival?.iataCode ?? "",
        departure: s.departure?.at ?? "",
        arrival: s.arrival?.at ?? "",
        carrier: s.carrierCode ?? "",
        flightNumber: s.number ?? "",
      })),
      refundable: false,
      raw: offer,
    };
  });
}
