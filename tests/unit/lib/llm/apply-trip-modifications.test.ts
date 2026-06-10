import { describe, expect, it } from "vitest";
import { applyTripModifications } from "@/lib/llm/apply-trip-modifications";
import type { TripSearchParams } from "@/lib/types/trip";

const base: TripSearchParams = {
  flights: {
    origin: "DXB",
    destination: "LON",
    departureDate: "2026-12-20",
    returnDate: "2026-12-27",
    passengers: { adults: 2, children: 2, infants: 0 },
    cabin: "ECONOMY",
  },
  hotels: {
    destination: "London",
    destinationCode: "LON",
    checkIn: "2026-12-20",
    checkOut: "2026-12-27",
    occupancies: [{ rooms: 1, adults: 2, children: 2, childAges: [8, 9] }],
  },
  budget: { maxTotal: 5000, currency: "USD" },
  tripType: "ROUND_TRIP",
};

describe("applyTripModifications", () => {
  it("updates budget while keeping route and dates", () => {
    const result = applyTripModifications("increase budget to $8000", base);
    expect(result?.budget?.maxTotal).toBe(8000);
    expect(result?.flights.origin).toBe("DXB");
    expect(result?.hotels.checkIn).toBe("2026-12-20");
  });

  it("expands k suffix in budget slang", () => {
    const result = applyTripModifications("Make budget to 3k", base);
    expect(result?.budget?.maxTotal).toBe(3000);
  });

  it("updates dates while keeping other fields", () => {
    const result = applyTripModifications("change dates to January 5-12", base);
    expect(result?.flights.departureDate).toBe("2026-01-05");
    expect(result?.flights.returnDate).toBe("2026-01-12");
    expect(result?.flights.origin).toBe("DXB");
  });

  it("updates passenger count", () => {
    const result = applyTripModifications("family of 5", base);
    expect(result?.flights.passengers).toEqual({ adults: 3, children: 2, infants: 0 });
    expect(result?.hotels.occupancies[0].adults).toBe(3);
  });

  it("updates passenger count from people phrasing", () => {
    const result = applyTripModifications("6 people", base);
    expect(result?.flights.passengers).toEqual({ adults: 3, children: 3, infants: 0 });
    expect(result?.hotels.occupancies[0].adults).toBe(3);
    expect(result?.hotels.occupancies[0].children).toBe(3);
  });

  it("returns null when no recognizable change", () => {
    expect(applyTripModifications("looks good", base)).toBeNull();
  });

  it("updates flight preferences for direct-only requests", () => {
    const result = applyTripModifications("show me direct flights only", base);
    expect(result?.preferences?.flights?.stops).toBe("direct");
    expect(result?.flights.nonStop).toBe(true);
  });

  it("recognizes no-stop phrasing as direct flights", () => {
    const result = applyTripModifications("no stop flights please", base);
    expect(result?.preferences?.flights?.stops).toBe("direct");
    expect(result?.flights.nonStop).toBe(true);
  });

  it("updates hotel sort preference", () => {
    const result = applyTripModifications("sort hotels by rating", base);
    expect(result?.preferences?.hotels?.sort).toBe("rating");
  });

  it("updates route when cities are mentioned", () => {
    const result = applyTripModifications("from Dubai to Paris", base);
    expect(result?.flights.destination).toBe("PAR");
    expect(result?.hotels.destinationCode).toBe("PAR");
    expect(result?.flights.origin).toBe("DXB");
  });

  it("resolves airport-index cities that are not in the metro list", () => {
    const result = applyTripModifications("from Dubai to Frankfurt", base);
    expect(result?.flights.destination).toBe("FRA");
    expect(result?.hotels.destinationCode).toBe("FRA");
    expect(result?.hotels.destination).toBeTruthy();
  });

  it("updates passenger counts from explicit adults and children", () => {
    const result = applyTripModifications("3 adults and 1 kid", base);
    expect(result?.flights.passengers).toEqual({ adults: 3, children: 1, infants: 0 });
    expect(result?.hotels.occupancies[0].adults).toBe(3);
    expect(result?.hotels.occupancies[0].children).toBe(1);
  });

  it("updates one-stop flight preference", () => {
    const result = applyTripModifications("one stop flights only", base);
    expect(result?.preferences?.flights?.stops).toBe("1");
  });

  it("updates multi-stop flight preference", () => {
    const result = applyTripModifications("allow 2+ stops", base);
    expect(result?.preferences?.flights?.stops).toBe("2plus");
  });

  it("updates flight sort preferences", () => {
    expect(applyTripModifications("cheapest flights", base)?.preferences?.flights?.sort).toBe(
      "price",
    );
    expect(applyTripModifications("fastest flights", base)?.preferences?.flights?.sort).toBe(
      "duration",
    );
    expect(applyTripModifications("earliest departure", base)?.preferences?.flights?.sort).toBe(
      "departure",
    );
  });

  it("updates refundable and airline preferences", () => {
    const result = applyTripModifications("refundable Emirates flights", base);
    expect(result?.preferences?.flights?.refundableOnly).toBe(true);
    expect(result?.preferences?.flights?.airlines).toContain("EK");
  });

  it("recognizes airline aliases in the message", () => {
    const result = applyTripModifications("prefer Qatar flights", base);
    expect(result?.preferences?.flights?.airlines).toContain("QR");
  });

  it("updates hotel price sort, stars, and board preferences", () => {
    const cheapest = applyTripModifications("cheapest hotel", base);
    expect(cheapest?.preferences?.hotels?.sort).toBe("price");

    const stars = applyTripModifications("4 star hotels", base);
    expect(stars?.preferences?.hotels?.minStars).toBe(4);

    const breakfast = applyTripModifications("breakfast included", base);
    expect(breakfast?.preferences?.hotels?.board).toBe("BB");

    const halfBoard = applyTripModifications("half board", base);
    expect(halfBoard?.preferences?.hotels?.board).toBe("HB");

    const roomOnly = applyTripModifications("room only", base);
    expect(roomOnly?.preferences?.hotels?.board).toBe("RO");
  });

  it("merges preferences with existing values", () => {
    const withPrefs = {
      ...base,
      preferences: {
        flights: { sort: "price" },
        hotels: { minStars: 3 },
      },
    };
    const result = applyTripModifications("direct flights only", withPrefs);
    expect(result?.preferences?.flights?.stops).toBe("direct");
    expect(result?.preferences?.flights?.sort).toBe("price");
    expect(result?.preferences?.hotels?.minStars).toBe(3);
    expect(result?.flights.nonStop).toBe(true);
  });

  it("updates adults without an explicit children count", () => {
    const result = applyTripModifications("4 adults", base);
    expect(result?.flights.passengers).toEqual({ adults: 4, children: 0, infants: 0 });
    expect(result?.hotels.occupancies[0].adults).toBe(4);
    expect(result?.hotels.occupancies[0].children).toBe(0);
  });

  it("recognizes additional airline aliases", () => {
    const result = applyTripModifications("prefer Turkish and Singapore flights", base);
    expect(result?.preferences?.flights?.airlines).toEqual(expect.arrayContaining(["TK", "SQ"]));
  });

  it("updates hotel rating sort preference", () => {
    const result = applyTripModifications("best rated hotels", base);
    expect(result?.preferences?.hotels?.sort).toBe("rating");
  });

  it("updates origin while keeping the stated destination", () => {
    const result = applyTripModifications("from Paris to London", base);
    expect(result?.flights.origin).toBe("PAR");
    expect(result?.flights.destination).toBe("LON");
    expect(result?.hotels.destinationCode).toBe("LON");
  });

  it("parses make-the-budget phrasing and bare dollar amounts", () => {
    expect(applyTripModifications("make the budget $4500", base)?.budget?.maxTotal).toBe(4500);
    expect(applyTripModifications("$6k", base)?.budget?.maxTotal).toBe(6000);
  });

  it("recognizes more airline aliases", () => {
    const result = applyTripModifications("Air France and KLM only", base);
    expect(result?.preferences?.flights?.airlines).toEqual(expect.arrayContaining(["AF", "KL"]));
  });

  it("recognizes delta, united, american, etihad, and cathay aliases", () => {
    const result = applyTripModifications(
      "Delta United American Etihad Cathay only",
      base,
    );
    expect(result?.preferences?.flights?.airlines).toEqual(
      expect.arrayContaining(["DL", "UA", "AA", "EY", "CX"]),
    );
  });

  it("updates destination only when the route names a new city", () => {
    const result = applyTripModifications("from Dubai to Paris", base);
    expect(result?.flights.destination).toBe("PAR");
    expect(result?.hotels.destinationCode).toBe("PAR");
    expect(result?.flights.origin).toBe("DXB");
  });

  it("updates hotel price sort preference", () => {
    const result = applyTripModifications("lowest hotel price", base);
    expect(result?.preferences?.hotels?.sort).toBe("price");
  });

  it("updates children count when only kids are mentioned", () => {
    const result = applyTripModifications("5 kids", base);
    expect(result?.flights.passengers).toEqual({ adults: 2, children: 5, infants: 0 });
    expect(result?.hotels.occupancies[0].children).toBe(5);
    expect(result?.hotels.occupancies[0].childAges).toEqual([8, 9, 10, 11, 12]);
  });

  it("returns null when route cities cannot be resolved", () => {
    expect(applyTripModifications("from Nowhereville to Unknowntown", base)).toBeNull();
  });

});
