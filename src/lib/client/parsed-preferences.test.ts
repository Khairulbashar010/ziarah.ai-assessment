import { describe, expect, it } from "vitest";
import { flightFiltersFromPreferences } from "./parsed-preferences";
import type { FlightFilterState } from "./flight-filters";

const defaults: FlightFilterState = {
  sort: "best",
  stops: "any",
  maxPrice: 1000,
  airlines: [],
  refundableOnly: false,
  withinBudgetOnly: false,
};

describe("parsed preferences", () => {
  it("maps direct flight preference to filter state", () => {
    const filters = flightFiltersFromPreferences(
      { flights: { stops: "direct", sort: "price" } },
      defaults,
    );

    expect(filters.stops).toBe("direct");
    expect(filters.sort).toBe("price");
  });
});
