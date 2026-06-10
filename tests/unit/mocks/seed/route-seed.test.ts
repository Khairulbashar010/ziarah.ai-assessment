import { describe, it, expect } from "vitest";
import { generateRouteSeed, resolveRouteSeed } from "@/mocks/seed/route-seed";

describe("route-seed", () => {
  it("keeps curated DXB-LON route details", () => {
    const seed = resolveRouteSeed("DXB", "LON");
    expect(seed?.offers[0].carrier).toBe("EK");
    expect(seed?.origin).toBe("DXB");
  });

  it("generates deterministic routes for any indexed airport pair", () => {
    const first = generateRouteSeed("SYD", "SIN");
    const second = generateRouteSeed("SYD", "SIN");

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first?.offers.length).toBeGreaterThanOrEqual(2);
    expect(first?.priceMin).toBeGreaterThan(0);
    expect(first?.offers[1].stops).toBe(1);
  });

  it("resolves metro search codes via display airports", () => {
    const seed = generateRouteSeed("LON", "DXB");
    expect(seed).not.toBeNull();
    expect(seed?.offers[0].origin).toBe("LHR");
    expect(seed?.offers[0].destination).toBe("DXB");
  });

  it("returns null for unknown airport codes", () => {
    expect(generateRouteSeed("ZZZ", "YYY")).toBeNull();
  });

  it("returns null when origin and destination resolve to the same airport", () => {
    expect(generateRouteSeed("LHR", "LHR")).toBeNull();
  });

  it("keeps secondary offers nonstop on short-haul routes", () => {
    const seed = generateRouteSeed("DXB", "DOH");
    expect(seed?.offers[1].stops).toBe(0);
  });

  it("wraps arrival clock times past midnight for long flights", () => {
    const seed = generateRouteSeed("SYD", "LHR");
    expect(seed).not.toBeNull();

    const lateDepartureOffer = seed!.offers.find((offer) => offer.departure === "23:10");
    expect(lateDepartureOffer).toBeDefined();
    expect(lateDepartureOffer!.arrival).toMatch(/^\d{2}:\d{2}$/);
  });

  it("returns null when only the search code resolves but no airport exists", () => {
    expect(generateRouteSeed("FAIL", "DXB")).toBeNull();
  });
});
