import { describe, expect, it, vi } from "vitest";
import {
  getAirportByCode,
  getAirportCoords,
  getAirportLabel,
  getCityLabel,
  resolveAirportCode,
  resolveAirportLatLon,
} from "@/lib/geo/airports";

describe("getAirportByCode", () => {
  it("returns airport data for known IATA codes", () => {
    const dxb = getAirportByCode("dxb");
    expect(dxb?.city).toBe("Dubai");
    expect(dxb?.lat).toBeTypeOf("number");
  });

  it("returns undefined for unknown codes", () => {
    expect(getAirportByCode("ZZZ")).toBeUndefined();
  });
});

describe("getAirportCoords", () => {
  it("returns coordinates for a known airport", () => {
    const airport = getAirportByCode("DXB");
    expect(getAirportCoords("DXB")).toEqual({ lat: airport!.lat, lon: airport!.lon });
  });

  it("resolves metro search codes to display airports", () => {
    const coords = getAirportCoords("LON");
    expect(coords?.lat).toBeCloseTo(51.47, 1);
  });

  it("returns null for empty or unknown codes", () => {
    expect(getAirportCoords("")).toBeNull();
    expect(getAirportCoords("   ")).toBeNull();
    expect(getAirportCoords("ZZZ")).toBeNull();
  });
});

describe("resolveAirportLatLon", () => {
  it("returns direct coordinates when available", () => {
    const coords = resolveAirportLatLon("DXB");
    expect(coords).toEqual(getAirportCoords("DXB"));
  });

  it("resolves London metro code via display airport", () => {
    const coords = resolveAirportLatLon("LON");
    expect(coords.lat).toBeCloseTo(51.47, 1);
  });

  it("uses built-in LHR fallback by default for unknown codes", () => {
    const coords = resolveAirportLatLon("ZZZ");
    expect(coords).toEqual({ lat: 51.47, lon: -0.4543 });
  });

  it("uses custom fallback for unknown codes", () => {
    const fallback = { lat: 10, lon: 20 };
    expect(resolveAirportLatLon("ZZZ", fallback)).toEqual(fallback);
  });

  it("uses the default LHR fallback constant for unknown codes", () => {
    expect(resolveAirportLatLon("ZZZ")).toEqual({ lat: 51.47, lon: -0.4543 });
  });
});

describe("resolveAirportLatLon with empty airport index", () => {
  it("uses built-in DXB fallback when the index has no coordinates", async () => {
    vi.resetModules();
    vi.doMock("@/data/airports-index.json", () => ({ default: {} }));

    const { resolveAirportLatLon: resolveWithEmptyIndex } = await import("@/lib/geo/airports");

    expect(resolveWithEmptyIndex("DXB")).toEqual({ lat: 25.2532, lon: 55.3657 });
    expect(resolveWithEmptyIndex("ZZZ")).toEqual({ lat: 51.47, lon: -0.4543 });

    vi.doUnmock("@/data/airports-index.json");
    vi.resetModules();
  });
});

describe("resolveAirportCode", () => {
  it("returns IATA code when given a valid 3-letter code", () => {
    expect(resolveAirportCode("dxb")).toBe("DXB");
  });

  it("resolves metro city names", () => {
    expect(resolveAirportCode("London")).toBe("LON");
    expect(resolveAirportCode("dubai")).toBe("DXB");
  });

  it("matches city names in the airport index", () => {
    expect(resolveAirportCode("paris")).toBeTruthy();
  });

  it("matches partial airport names in the index", () => {
    expect(resolveAirportCode("heathrow")).toBe("LHR");
  });

  it("returns null for unknown input", () => {
    expect(resolveAirportCode("nowhereville")).toBeNull();
  });
});

describe("getCityLabel", () => {
  it("returns city name for known codes", () => {
    expect(getCityLabel("DXB")).toBe("Dubai");
  });

  it("returns the code when airport is unknown", () => {
    expect(getCityLabel("ZZZ")).toBe("ZZZ");
  });
});

describe("getAirportLabel", () => {
  it("returns city and code for known airports", () => {
    expect(getAirportLabel("DXB")).toBe("Dubai (DXB)");
  });

  it("returns the code when airport is unknown", () => {
    expect(getAirportLabel("ZZZ")).toBe("ZZZ");
  });
});
