import { describe, expect, it } from "vitest";
import {
  flightFiltersFromPreferences,
  hotelFiltersFromPreferences,
} from "@/lib/client/parsed-preferences";
import type { FlightFilterState } from "@/lib/client/flight-filters";

const defaults: FlightFilterState = {
  sort: "best",
  stops: "any",
  maxPrice: 1000,
  airlines: [],
  refundableOnly: false,
  withinBudgetOnly: false,
};

const hotelDefaults = {
  sort: "best" as const,
  minStars: 4,
  withinBudgetOnly: false,
};

describe("parsed preferences", () => {
  it("returns defaults when preferences are missing", () => {
    expect(flightFiltersFromPreferences(undefined, defaults)).toBe(defaults);
    expect(hotelFiltersFromPreferences(undefined, hotelDefaults)).toBe(hotelDefaults);
  });

  it("returns defaults when domain preferences are missing", () => {
    expect(flightFiltersFromPreferences({}, defaults)).toBe(defaults);
    expect(hotelFiltersFromPreferences({}, hotelDefaults)).toBe(hotelDefaults);
  });

  it("maps direct flight preference to filter state", () => {
    const filters = flightFiltersFromPreferences(
      { flights: { stops: "direct", sort: "price" } },
      defaults,
    );

    expect(filters.stops).toBe("direct");
    expect(filters.sort).toBe("price");
  });

  it("keeps defaults for unspecified flight preference fields", () => {
    const filters = flightFiltersFromPreferences({ flights: {} }, defaults);

    expect(filters).toEqual(defaults);
  });

  it("keeps defaults for unspecified hotel preference fields", () => {
    const filters = hotelFiltersFromPreferences({ hotels: {} }, hotelDefaults);

    expect(filters).toEqual(hotelDefaults);
  });

  it("maps refundable and airline flight preferences", () => {
    const filters = flightFiltersFromPreferences(
      {
        flights: {
          refundableOnly: true,
          airlines: ["EK", "BA"],
          sort: "duration",
          stops: "1",
        },
      },
      defaults,
    );

    expect(filters.refundableOnly).toBe(true);
    expect(filters.airlines).toEqual(["EK", "BA"]);
    expect(filters.sort).toBe("duration");
    expect(filters.stops).toBe("1");
  });

  it("maps hotel sort and star preferences", () => {
    const filters = hotelFiltersFromPreferences(
      { hotels: { sort: "rating", minStars: 5 } },
      hotelDefaults,
    );

    expect(filters.sort).toBe("rating");
    expect(filters.minStars).toBe(5);
    expect(filters.withinBudgetOnly).toBe(false);
  });
});
