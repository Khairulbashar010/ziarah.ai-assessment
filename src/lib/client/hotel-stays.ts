import type { HotelStaySegment, PublicHotelOffer } from "@/lib/types/trip";

export function perNightPrice(offer: PublicHotelOffer): number {
  return offer.nights > 0 ? offer.totalPrice / offer.nights : offer.totalPrice;
}

export function staySegmentPrice(offer: PublicHotelOffer, nights: number): number {
  return perNightPrice(offer) * nights;
}

export function totalStaysPrice(
  stays: HotelStaySegment[],
  offers: PublicHotelOffer[],
): number {
  return stays.reduce((sum, stay) => {
    const offer = offers.find((o) => o.id === stay.offerId);
    return sum + (offer ? staySegmentPrice(offer, stay.nights) : 0);
  }, 0);
}

export function assignedNights(stays: HotelStaySegment[]): number {
  return stays.reduce((sum, stay) => sum + stay.nights, 0);
}

export function remainingNights(tripNights: number, stays: HotelStaySegment[]): number {
  return Math.max(0, tripNights - assignedNights(stays));
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function recomputeStayDates(
  stays: HotelStaySegment[],
  tripCheckIn: string,
): HotelStaySegment[] {
  let cursor = tripCheckIn;
  return stays.map((stay) => {
    const checkIn = cursor;
    const checkOut = addDays(checkIn, stay.nights);
    cursor = checkOut;
    return { ...stay, checkIn, checkOut };
  });
}

export function appendStaySegment(
  stays: HotelStaySegment[],
  offer: PublicHotelOffer,
  nights: number,
  tripCheckIn: string,
): HotelStaySegment[] {
  const checkIn = stays.length > 0 ? stays[stays.length - 1]!.checkOut : tripCheckIn;
  return recomputeStayDates(
    [
      ...stays,
      {
        id: `${offer.id}-${checkIn}-${nights}`,
        offerId: offer.id,
        nights,
        checkIn,
        checkOut: addDays(checkIn, nights),
      },
    ],
    tripCheckIn,
  );
}

export function createFullStay(offer: PublicHotelOffer): HotelStaySegment {
  return {
    id: `${offer.id}-full`,
    offerId: offer.id,
    nights: offer.nights,
    checkIn: offer.checkIn,
    checkOut: offer.checkOut,
  };
}

export function removeStaySegment(
  stays: HotelStaySegment[],
  segmentId: string,
  tripCheckIn: string,
): HotelStaySegment[] {
  return recomputeStayDates(
    stays.filter((stay) => stay.id !== segmentId),
    tripCheckIn,
  );
}

export function updateStayNights(
  stays: HotelStaySegment[],
  segmentId: string,
  nights: number,
  tripCheckIn: string,
  tripNights: number,
): HotelStaySegment[] {
  const others = assignedNights(stays.filter((stay) => stay.id !== segmentId));
  const cappedNights = Math.max(1, Math.min(nights, tripNights - others));
  const updated = stays.map((stay) =>
    stay.id === segmentId ? { ...stay, nights: cappedNights } : stay,
  );
  return recomputeStayDates(updated, tripCheckIn);
}

export function segmentsForOffer(
  stays: HotelStaySegment[],
  offerId: string,
): HotelStaySegment[] {
  return stays.filter((stay) => stay.offerId === offerId);
}

export function isOfferInStays(stays: HotelStaySegment[], offerId: string): boolean {
  return stays.some((stay) => stay.offerId === offerId);
}
