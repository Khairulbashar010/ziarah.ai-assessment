import { describe, it, expect } from "vitest";
import { generateRouteSeed, resolveRouteSeed } from "./route-seed";

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
});
