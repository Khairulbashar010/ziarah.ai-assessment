import { describe, expect, it } from "vitest";
import {
  METRO_CITIES,
  resolveDisplayAirport,
  resolveMetroCity,
} from "@/lib/geo/metro-cities";

describe("resolveMetroCity", () => {
  it("returns metro metadata for known cities", () => {
    expect(resolveMetroCity("London")).toEqual(METRO_CITIES.london);
    expect(resolveMetroCity("  dubai  ")).toEqual(METRO_CITIES.dubai);
  });

  it("returns null for unknown cities", () => {
    expect(resolveMetroCity("Oslo")).toBeNull();
    expect(resolveMetroCity("")).toBeNull();
  });
});

describe("resolveDisplayAirport", () => {
  it("maps metro search codes to primary display airports", () => {
    expect(resolveDisplayAirport("LON")).toBe("LHR");
    expect(resolveDisplayAirport("PAR")).toBe("CDG");
    expect(resolveDisplayAirport("NYC")).toBe("JFK");
  });

  it("uppercases unknown IATA codes unchanged", () => {
    expect(resolveDisplayAirport("dxb")).toBe("DXB");
    expect(resolveDisplayAirport("zzz")).toBe("ZZZ");
    expect(resolveDisplayAirport("")).toBe("");
  });
});

describe("METRO_CITIES", () => {
  it("includes test-only fail metro metadata", () => {
    expect(METRO_CITIES.fail.searchCode).toBe("ZZZ");
    expect(resolveMetroCity("fail")?.displayAirport).toBe("ZZZ");
  });
});
