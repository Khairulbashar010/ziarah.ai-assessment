import { describe, it, expect, vi } from "vitest";
import {
  generateHotelsForAirport,
  resolveHotelsForDestination,
  listAllHotelDestinations,
} from "@/mocks/seed/hotel-seed";
import { getAirportByCode } from "@/lib/geo/airports";

describe("hotel-seed", () => {
  it("prefers curated London hotels", () => {
    const hotels = resolveHotelsForDestination("LON");
    expect(hotels[0].name).toBe("London City Inn");
  });

  it("returns generated hotels for arbitrary airport codes", () => {
    const hotels = resolveHotelsForDestination("SYD");
    expect(hotels.length).toBeGreaterThan(0);
    expect(hotels[0].destinationCode).toBe("SYD");
    expect(hotels[0].lat).not.toBe(0);
  });

  it("generates hotels dynamically when no static seed exists", async () => {
    vi.resetModules();
    vi.doMock("@/mocks/seed/curated-hotels.json", () => ({ default: [] }));
    vi.doMock("@/mocks/seed/hotels.json", () => ({ default: [] }));

    const { resolveHotelsForDestination: resolveWithoutStatic } = await import(
      "@/mocks/seed/hotel-seed"
    );
    const airport = getAirportByCode("SYD");
    expect(airport).toBeDefined();

    const hotels = resolveWithoutStatic("SYD");

    expect(hotels.length).toBeGreaterThan(0);
    expect(hotels[0].destinationCode).toBe("SYD");
    expect(hotels[0].name).toContain(airport!.city);

    vi.doUnmock("@/mocks/seed/curated-hotels.json");
    vi.doUnmock("@/mocks/seed/hotels.json");
    vi.resetModules();
  });

  it("covers every airport in the index plus metro aliases", () => {
    const destinations = listAllHotelDestinations();
    expect(destinations.length).toBeGreaterThanOrEqual(3885);
    expect(destinations).toContain("SYD");
    expect(destinations).toContain("LON");
    expect(destinations).toEqual([...destinations].sort());
  });

  it("returns an empty list for unknown airport codes", () => {
    expect(resolveHotelsForDestination("ZZZ")).toEqual([]);
  });
});

describe("generateHotelsForAirport", () => {
  it("covers 3, 4, and 5 star categories across generated hotels", () => {
    const categories = new Set<string>();

    for (let index = 0; index < 200; index += 1) {
      const code = `T${String(index).padStart(2, "0")}`;
      const hotels = generateHotelsForAirport(code, { city: "Test City", lat: 10, lon: 20 });
      for (const hotel of hotels) {
        categories.add(hotel.category);
      }
    }

    expect(categories.has("3 STARS")).toBe(true);
    expect(categories.has("4 STARS")).toBe(true);
    expect(categories.has("5 STARS")).toBe(true);
  });

  it("generates deterministic hotels from airport metadata", () => {
    const airport = getAirportByCode("SYD");
    expect(airport).toBeDefined();

    const first = generateHotelsForAirport("SYD", {
      city: airport!.city,
      lat: airport!.lat,
      lon: airport!.lon,
    });
    const second = generateHotelsForAirport("SYD", {
      city: airport!.city,
      lat: airport!.lat,
      lon: airport!.lon,
    });

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(first[0].destinationCode).toBe("SYD");
    expect(first[0].name).toContain(airport!.city);
    expect(first[0].pricePerNight).toBeGreaterThan(0);
  });
});
