import { describe, expect, it } from "vitest";
import {
  appendStaySegment,
  assignedNights,
  createFullStay,
  perNightPrice,
  recomputeStayDates,
  remainingNights,
  removeStaySegment,
  staySegmentPrice,
  totalStaysPrice,
  updateStayNights,
} from "./hotel-stays";
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
    expect(staySegmentPrice(offerA, 2)).toBe(200);
    expect(staySegmentPrice(offerB, 4)).toBe(200);
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
    const stays = appendStaySegment([], offerA, 2, "2026-12-20");
    const updated = updateStayNights(stays, stays[0]!.id, 9, "2026-12-20", 7);
    expect(assignedNights(updated)).toBe(7);
  });
});
