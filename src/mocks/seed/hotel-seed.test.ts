import { describe, it, expect } from "vitest";
import { resolveHotelsForDestination, listAllHotelDestinations } from "./hotel-seed";

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

  it("covers every airport in the index plus metro aliases", () => {
    const destinations = listAllHotelDestinations();
    expect(destinations.length).toBeGreaterThanOrEqual(3885);
    expect(destinations).toContain("SYD");
    expect(destinations).toContain("LON");
  });
});
