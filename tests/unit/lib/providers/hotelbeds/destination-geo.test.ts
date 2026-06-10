import { afterEach, describe, expect, it, vi } from "vitest";
import { getAirportByCode } from "@/lib/geo/airports";
import { resolveDestinationGeo } from "@/lib/providers/hotelbeds/destination-geo";
import * as hotelSeed from "@/mocks/seed/hotel-seed";

describe("resolveDestinationGeo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("averages coordinates from seeded hotels for known destinations", () => {
    const geo = resolveDestinationGeo("LON");

    expect(geo.lat).toBeGreaterThan(50);
    expect(geo.lng).toBeLessThan(0);
  });

  it("falls back to airport coordinates when no hotel seeds exist", () => {
    vi.spyOn(hotelSeed, "resolveHotelsForDestination").mockReturnValue([]);
    const airport = getAirportByCode("JFK");
    expect(airport).toBeDefined();

    const geo = resolveDestinationGeo("JFK");

    expect(geo).toEqual({ lat: airport!.lat, lng: airport!.lon });
  });

  it("resolves coordinates for generated airport destinations", () => {
    const geo = resolveDestinationGeo("SYD");

    expect(geo.lat).toBeLessThan(0);
    expect(geo.lng).toBeGreaterThan(140);
  });

  it("resolves metro search codes via display airports", () => {
    vi.spyOn(hotelSeed, "resolveHotelsForDestination").mockReturnValue([]);
    const geo = resolveDestinationGeo("PAR");

    expect(geo.lat).toBeGreaterThan(48);
    expect(geo.lng).toBeGreaterThan(1);
  });

  it("throws when no geolocation mapping exists", () => {
    expect(() => resolveDestinationGeo("ZZZ")).toThrow(
      "No geolocation mapping for destination code ZZZ",
    );
  });
});
