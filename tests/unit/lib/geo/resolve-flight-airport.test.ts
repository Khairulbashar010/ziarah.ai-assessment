import { describe, expect, it } from "vitest";
import type { TripSearchParams } from "@/lib/types/trip";
import {
  inferRouteFromQuery,
  resolveFlightAirportCode,
} from "@/lib/geo/resolve-flight-airport";

const parsedQuery: TripSearchParams = {
  tripType: "ROUND_TRIP",
  flights: {
    origin: "DXB",
    destination: "LON",
    departureDate: "2026-12-20",
    returnDate: "2026-12-27",
    passengers: { adults: 2, children: 0, infants: 0 },
    cabin: "ECONOMY",
  },
  hotels: {
    destination: "London",
    destinationCode: "LON",
    checkIn: "2026-12-20",
    checkOut: "2026-12-27",
    occupancies: [{ rooms: 1, adults: 2, children: 0 }],
  },
};

describe("resolveFlightAirportCode", () => {
  it("resolves metro search codes to display airports", () => {
    expect(resolveFlightAirportCode("LON")).toBe("LHR");
    expect(resolveFlightAirportCode("DXB")).toBe("DXB");
    expect(resolveFlightAirportCode("PAR")).toBe("CDG");
    expect(resolveFlightAirportCode("TYO")).toBe("NRT");
    expect(resolveFlightAirportCode("BKK")).toBe("BKK");
    expect(resolveFlightAirportCode("NYC")).toBe("JFK");
    expect(resolveFlightAirportCode("ROM")).toBe("FCO");
    expect(resolveFlightAirportCode("BCN")).toBe("BCN");
    expect(resolveFlightAirportCode("AMS")).toBe("AMS");
    expect(resolveFlightAirportCode("SIN")).toBe("SIN");
  });

  it("resolves city names via airport index", () => {
    expect(resolveFlightAirportCode("dubai")).toBe("DXB");
    expect(resolveFlightAirportCode("London")).toBe("LHR");
  });

  it("uppercases unknown codes after resolution attempt", () => {
    expect(resolveFlightAirportCode("nowhere")).toBe("NOWHERE");
    expect(resolveFlightAirportCode("abc")).toBe("ABC");
  });
});

describe("inferRouteFromQuery", () => {
  it("uses parsed query when provided", () => {
    const route = inferRouteFromQuery("ignored", parsedQuery);
    expect(route.originCode).toBe("DXB");
    expect(route.destinationCode).toBe("LHR");
    expect(route.originLabel).toBe("Dubai");
    expect(route.destinationLabel).toBe("London");
  });

  it("falls back to parsed origin text when airport metadata is missing", () => {
    const unknownOrigin = {
      ...parsedQuery,
      flights: { ...parsedQuery.flights, origin: "ZZZ" },
    };
    const route = inferRouteFromQuery("ignored", unknownOrigin);

    expect(route.originCode).toBe("ZZZ");
    expect(route.originLabel).toBe("ZZZ");
  });

  it("parses from/to phrasing when no parsed query", () => {
    const route = inferRouteFromQuery("family trip from Dubai to London, December");
    expect(route.originCode).toBe("DXB");
    expect(route.destinationCode).toBe("LHR");
    expect(route.originLabel).toBe("Dubai");
    expect(route.destinationLabel).toBe("London");
  });

  it("falls back to DXB → LHR defaults", () => {
    const route = inferRouteFromQuery("plan a winter holiday");
    expect(route).toEqual({
      originCode: "DXB",
      destinationCode: "LHR",
      originLabel: "Dubai",
      destinationLabel: "London",
    });
  });
});
