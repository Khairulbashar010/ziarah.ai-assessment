import { describe, expect, it } from "vitest";
import {
  appendStaySegment,
  assignedNights,
  createFullStay,
  isOfferInStays,
  perNightPrice,
  recomputeStayDates,
  remainingNights,
  removeStaySegment,
  segmentsForOffer,
  staySegmentPrice,
  totalStaysPrice,
  updateStayNights,
} from "@/lib/client/hotel-stays";
import type { PublicHotelOffer } from "@/lib/types/trip";

const offerA: PublicHotelOffer = {
  id: "hotel-a",
  provider: "hotelbeds",
  hotelCode: 1,
  hotelName: "London City Inn",
  destinationCode: "LON",
  category: "4",
  checkIn: "2026-12-20",
  checkOut: "2026-12-27",
  nights: 7,
  roomName: "DOUBLE STANDARD",
  boardName: "ROOM ONLY",
  totalPrice: 700,
  currency: "USD",
  rateType: "BOOKABLE",
  cancellationPolicies: [],
};

const offerB: PublicHotelOffer = {
  ...offerA,
  id: "hotel-b",
  hotelName: "London Budget Stay",
  totalPrice: 350,
};

describe("hotel-stays", () => {
  it("computes per-night and segment prices", () => {
    expect(perNightPrice(offerA)).toBe(100);
    expect(perNightPrice({ ...offerA, nights: 0 })).toBe(700);
    expect(staySegmentPrice(offerA, 2)).toBe(200);
    expect(staySegmentPrice(offerB, 4)).toBe(200);
  });

  it("ignores missing offers when totalling stay prices", () => {
    const stays = appendStaySegment([], offerA, 2, "2026-12-20");
    expect(totalStaysPrice(stays, [])).toBe(0);
  });

  it("builds sequential split stays", () => {
    let stays = appendStaySegment([], offerA, 2, "2026-12-20");
    stays = appendStaySegment(stays, offerB, 4, "2026-12-20");
    stays = appendStaySegment(stays, offerA, 1, "2026-12-20");

    expect(assignedNights(stays)).toBe(7);
    expect(remainingNights(7, stays)).toBe(0);
    expect(stays.map((stay) => stay.checkIn)).toEqual([
      "2026-12-20",
      "2026-12-22",
      "2026-12-26",
    ]);
    expect(totalStaysPrice(stays, [offerA, offerB])).toBe(500);
  });

  it("recomputes dates after removal", () => {
    const full = createFullStay(offerA);
    const split = appendStaySegment([], offerB, 3, "2026-12-20");
    const stays = recomputeStayDates([...split, full], "2026-12-20");

    expect(stays[1]?.checkIn).toBe("2026-12-23");
    expect(removeStaySegment(stays, split[0]!.id, "2026-12-20")[0]?.checkIn).toBe("2026-12-20");
  });

  it("caps nights when updating a segment", () => {
    let stays = appendStaySegment([], offerA, 2, "2026-12-20");
    stays = appendStaySegment(stays, offerB, 2, "2026-12-20");
    const updated = updateStayNights(stays, stays[0]!.id, 9, "2026-12-20", 7);
    expect(assignedNights(updated)).toBe(7);
    expect(updated[1]?.nights).toBe(2);
  });

  it("returns segments for a specific offer", () => {
    const stays = appendStaySegment([], offerA, 2, "2026-12-20");
    const more = appendStaySegment(stays, offerB, 3, "2026-12-20");

    expect(segmentsForOffer(more, offerA.id)).toHaveLength(1);
    expect(segmentsForOffer(more, offerB.id)).toHaveLength(1);
    expect(segmentsForOffer(more, "missing")).toEqual([]);
  });

  it("detects whether an offer is already in stays", () => {
    const stays = appendStaySegment([], offerA, 2, "2026-12-20");

    expect(isOfferInStays(stays, offerA.id)).toBe(true);
    expect(isOfferInStays(stays, offerB.id)).toBe(false);
  });

  it("reports remaining nights before the trip is fully assigned", () => {
    const stays = appendStaySegment([], offerA, 3, "2026-12-20");

    expect(remainingNights(7, stays)).toBe(4);
  });
});
