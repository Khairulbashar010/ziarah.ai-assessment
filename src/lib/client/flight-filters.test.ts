import { describe, it, expect } from "vitest";
import {
  applyFlightFilters,
  getDefaultFlightFilters,
} from "./flight-filters";
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
});
