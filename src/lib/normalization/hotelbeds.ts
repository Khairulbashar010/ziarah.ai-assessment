import type { UnifiedHotelOffer } from "@/lib/types/trip";
import { nightsBetween } from "@/lib/utils/dates";

type HbRate = {
  rateKey: string;
  rateType: string;
  net: string;
  sellingRate?: string;
  boardName: string;
  currency?: string;
  cancellationPolicies?: Array<{ amount: string; from: string }>;
};

type HbHotel = {
  code: number;
  name: string;
  categoryName: string;
  destinationCode: string;
  currency?: string;
  rooms: Array<{ name: string; rates: HbRate[] }>;
};

export function normalizeHotelBedsHotels(
  raw: unknown,
  checkIn: string,
  checkOut: string,
): UnifiedHotelOffer[] {
  const response = raw as { hotels?: { hotels?: HbHotel[] } };
  const hotels = response.hotels?.hotels ?? [];
  const nights = nightsBetween(checkIn, checkOut);
  const offers: UnifiedHotelOffer[] = [];

  for (const hotel of hotels) {
    for (const room of hotel.rooms) {
      for (const rate of room.rates) {
        offers.push({
          id: rate.rateKey,
          provider: "hotelbeds",
          hotelCode: hotel.code,
          hotelName: hotel.name,
          destinationCode: hotel.destinationCode,
          category: hotel.categoryName,
          checkIn,
          checkOut,
          nights,
          roomName: room.name,
          boardName: rate.boardName,
          totalPrice: Number(rate.sellingRate ?? rate.net),
          currency: rate.currency ?? hotel.currency ?? "USD",
          rateType: rate.rateType === "RECHECK" ? "RECHECK" : "BOOKABLE",
          cancellationPolicies: rate.cancellationPolicies ?? [],
          raw: { hotel, room, rate },
        });
      }
    }
  }

  return offers;
}
