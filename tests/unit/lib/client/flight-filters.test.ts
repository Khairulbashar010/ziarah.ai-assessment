import { describe, it, expect } from "vitest";
import {
  applyFlightFilters,
  countActiveFilters,
  getAvailableAirlines,
  getDefaultFlightFilters,
  getPriceRange,
} from "@/lib/client/flight-filters";
import type { UnifiedFlightOffer } from "@/lib/types/trip";

const offer = (
  id: string,
  price: number,
  stops: number,
  carrier = "EK",
): UnifiedFlightOffer => ({
  id,
  provider: "sabre",
  totalPrice: price,
  currency: "USD",
  perPassenger: price / 2,
  validatingCarrier: carrier,
  stops,
  durationMinutes: 480,
  segments: [
    {
      origin: "DXB",
      destination: "LHR",
      departure: "2026-12-20T08:00:00Z",
      arrival: "2026-12-20T14:00:00Z",
      carrier,
      flightNumber: "1",
    },
  ],
  refundable: stops === 0,
  raw: {},
});

describe("flight filters", () => {
  const offers = [offer("f1", 1200, 0), offer("f2", 2800, 1, "BA"), offer("f3", 3500, 2)];

  it("filters by budget and stops", () => {
    const defaults = getDefaultFlightFilters(offers, 3000);
    const filtered = applyFlightFilters(
      offers,
      { ...defaults, stops: "direct", withinBudgetOnly: true },
      3000,
    );

    expect(filtered.map((f) => f.id)).toEqual(["f1"]);
  });

  it("sorts by best match by default (fewer stops, then price)", () => {
    const defaults = getDefaultFlightFilters(offers);
    const filtered = applyFlightFilters(offers, { ...defaults, withinBudgetOnly: false }, undefined);

    expect(filtered.map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("returns empty price range for no offers", () => {
    expect(getPriceRange([])).toEqual({ min: 0, max: 0 });
  });

  it("returns min and max prices", () => {
    expect(getPriceRange(offers)).toEqual({ min: 1200, max: 3500 });
  });

  it("collects available airlines from validating and segment carriers", () => {
    const multiSegment: UnifiedFlightOffer = {
      ...offer("f4", 2000, 1, "EK"),
      segments: [
        {
          origin: "DXB",
          destination: "FRA",
          departure: "2026-12-20T08:00:00Z",
          arrival: "2026-12-20T12:00:00Z",
          carrier: "LH",
          flightNumber: "1",
        },
        {
          origin: "FRA",
          destination: "LHR",
          departure: "2026-12-20T14:00:00Z",
          arrival: "2026-12-20T15:00:00Z",
          carrier: "BA",
          flightNumber: "2",
        },
      ],
    };

    expect(getAvailableAirlines([multiSegment])).toEqual(["BA", "EK", "LH"]);
  });

  it("uses null max price when there are no offers and no budget", () => {
    expect(getDefaultFlightFilters([])).toMatchObject({
      maxPrice: null,
      withinBudgetOnly: false,
    });
  });

  it("filters one-stop and two-plus-stop offers", () => {
    const defaults = getDefaultFlightFilters(offers);

    expect(
      applyFlightFilters(offers, { ...defaults, stops: "1" }, undefined).map((f) => f.id),
    ).toEqual(["f2"]);
    expect(
      applyFlightFilters(offers, { ...defaults, stops: "2plus" }, undefined).map((f) => f.id),
    ).toEqual(["f3"]);
  });

  it("filters by airline selection", () => {
    const defaults = getDefaultFlightFilters(offers);
    const filtered = applyFlightFilters(
      offers,
      { ...defaults, airlines: ["BA"] },
      undefined,
    );

    expect(filtered.map((f) => f.id)).toEqual(["f2"]);
  });

  it("filters refundable offers only", () => {
    const defaults = getDefaultFlightFilters(offers);
    const filtered = applyFlightFilters(
      offers,
      { ...defaults, refundableOnly: true },
      undefined,
    );

    expect(filtered.map((f) => f.id)).toEqual(["f1"]);
  });

  it("sorts by departure when segment times are missing", () => {
    const defaults = getDefaultFlightFilters([]);
    const sparseSegments = [
      {
        ...offer("empty", 1000, 0),
        segments: [],
      },
      {
        ...offer("partial", 2000, 0),
        segments: [
          {
            origin: "DXB",
            destination: "LHR",
            arrival: "2026-12-20T14:00:00Z",
            carrier: "EK",
            flightNumber: "1",
          },
        ],
      },
    ];

    expect(
      applyFlightFilters(sparseSegments, { ...defaults, sort: "departure" }, undefined),
    ).toHaveLength(2);
  });

  it("sorts by price, duration, and departure", () => {
    const defaults = getDefaultFlightFilters(offers);
    const departureOffers = [
      {
        ...offer("late", 2000, 0),
        durationMinutes: 500,
        segments: [
          {
            origin: "DXB",
            destination: "LHR",
            departure: "2026-12-20T18:00:00Z",
            arrival: "2026-12-20T23:00:00Z",
            carrier: "EK",
            flightNumber: "9",
          },
        ],
      },
      {
        ...offer("early", 2500, 0),
        durationMinutes: 400,
        segments: [
          {
            origin: "DXB",
            destination: "LHR",
            departure: "2026-12-20T06:00:00Z",
            arrival: "2026-12-20T11:00:00Z",
            carrier: "EK",
            flightNumber: "1",
          },
        ],
      },
    ];

    expect(
      applyFlightFilters(departureOffers, { ...defaults, sort: "price" }, undefined).map(
        (f) => f.id,
      ),
    ).toEqual(["late", "early"]);
    expect(
      applyFlightFilters(departureOffers, { ...defaults, sort: "duration" }, undefined).map(
        (f) => f.id,
      ),
    ).toEqual(["early", "late"]);
    expect(
      applyFlightFilters(departureOffers, { ...defaults, sort: "departure" }, undefined).map(
        (f) => f.id,
      ),
    ).toEqual(["early", "late"]);
  });

  it("filters out offers above budgetMax when withinBudgetOnly is enabled", () => {
    const defaults = getDefaultFlightFilters(offers, 3000);
    const filtered = applyFlightFilters(
      offers,
      { ...defaults, withinBudgetOnly: true },
      2000,
    );

    expect(filtered.map((f) => f.id)).toEqual(["f1"]);
  });

  it("filters by max price ceiling", () => {
    const defaults = getDefaultFlightFilters(offers);
    const filtered = applyFlightFilters(
      offers,
      { ...defaults, maxPrice: 2000 },
      undefined,
    );

    expect(filtered.map((f) => f.id)).toEqual(["f1"]);
  });

  it("skips budget filtering when withinBudgetOnly is true but budgetMax is undefined", () => {
    const defaults = getDefaultFlightFilters(offers);
    const filtered = applyFlightFilters(
      offers,
      { ...defaults, withinBudgetOnly: true },
      undefined,
    );

    expect(filtered).toHaveLength(3);
  });

  it("counts active filters against defaults", () => {
    const defaults = getDefaultFlightFilters(offers, 3000);
    const active = {
      ...defaults,
      stops: "direct" as const,
      refundableOnly: true,
      airlines: ["EK"],
      maxPrice: 2000,
      withinBudgetOnly: false,
    };

    expect(countActiveFilters(active, defaults)).toBe(5);
    expect(countActiveFilters(defaults, defaults)).toBe(0);
  });
});
