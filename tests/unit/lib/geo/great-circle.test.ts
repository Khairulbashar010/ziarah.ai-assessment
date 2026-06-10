import { describe, expect, it } from "vitest";
import {
  arcToSvgPath,
  greatCircleArc,
  greatCircleMidpoint,
  haversineKm,
  interpolateAlongGreatCircle,
  latLonToUnitVector,
  projectEquirectangular,
  unitVectorToLatLon,
} from "@/lib/geo/great-circle";

const dxb = { lat: 25.2509, lon: 55.3629 };
const lhr = { lat: 51.4703, lon: -0.45342 };

describe("latLonToUnitVector", () => {
  it("produces a unit-length vector", () => {
    const v = latLonToUnitVector(dxb);
    const length = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
    expect(length).toBeCloseTo(1, 5);
  });
});

describe("greatCircleArc", () => {
  it("returns endpoints and intermediate points", () => {
    const arc = greatCircleArc(dxb, lhr, 4);
    expect(arc).toHaveLength(5);
    expect(arc[0]?.lat).toBeCloseTo(dxb.lat, 1);
    expect(arc[arc.length - 1]?.lat).toBeCloseTo(lhr.lat, 1);
  });

  it("handles identical points without dividing by zero", () => {
    const arc = greatCircleArc(dxb, dxb, 2);
    expect(arc).toHaveLength(3);
    expect(arc[1]?.lat).toBeCloseTo(dxb.lat, 3);
  });

  it("throws for invalid coordinates", () => {
    expect(() => greatCircleArc(null as unknown as typeof dxb, lhr)).toThrow(
      "Invalid lat/lon point",
    );
    expect(() =>
      greatCircleArc({ lat: 1, lon: undefined as unknown as number }, lhr),
    ).toThrow("Invalid lat/lon point");
  });
});

describe("projectEquirectangular", () => {
  it("maps lat/lon into padded SVG coordinates", () => {
    const point = projectEquirectangular({ lat: 0, lon: 0 }, 400, 200, 20);
    expect(point.x).toBeCloseTo(200, 0);
    expect(point.y).toBeCloseTo(100, 0);
  });
});

describe("arcToSvgPath", () => {
  it("returns an empty path for no points", () => {
    expect(arcToSvgPath([], 400, 200)).toBe("");
  });

  it("builds an SVG path from projected arc points", () => {
    const path = arcToSvgPath(greatCircleArc(dxb, lhr, 2), 400, 200);
    expect(path.startsWith("M ")).toBe(true);
    expect(path).toContain("L ");
  });
});

describe("greatCircleMidpoint", () => {
  it("lies between Dubai and London airports", () => {
    const mid = greatCircleMidpoint(dxb, lhr);

    const originToMid = haversineKm(dxb, mid);
    const midToDest = haversineKm(mid, lhr);
    const total = haversineKm(dxb, lhr);

    expect(originToMid).toBeGreaterThan(1000);
    expect(midToDest).toBeGreaterThan(1000);
    expect(originToMid + midToDest).toBeCloseTo(total, -1);
  });
});

describe("unitVectorToLatLon", () => {
  it("round-trips through latLonToUnitVector", () => {
    const vector = latLonToUnitVector(dxb);
    const restored = unitVectorToLatLon(vector);
    expect(restored.lat).toBeCloseTo(dxb.lat, 3);
    expect(restored.lon).toBeCloseTo(dxb.lon, 3);
  });
});

describe("interpolateAlongGreatCircle", () => {
  it("returns the start point at t = 0 and the end point at t = 1", () => {
    const start = interpolateAlongGreatCircle(dxb, lhr, 0);
    const end = interpolateAlongGreatCircle(dxb, lhr, 1);

    expect(start.lat).toBeCloseTo(dxb.lat, 3);
    expect(end.lat).toBeCloseTo(lhr.lat, 1);
  });

  it("returns the start point when points are effectively identical", () => {
    const point = interpolateAlongGreatCircle(dxb, dxb, 0.5);
    expect(point.lat).toBeCloseTo(dxb.lat, 3);
  });

  it("clamps interpolation progress outside 0..1", () => {
    const beyond = interpolateAlongGreatCircle(dxb, lhr, 2);
    const atEnd = interpolateAlongGreatCircle(dxb, lhr, 1);
    expect(beyond.lat).toBeCloseTo(atEnd.lat, 3);
  });
});

describe("haversineKm", () => {
  it("measures distance between two airports", () => {
    expect(haversineKm(dxb, lhr)).toBeGreaterThan(5000);
  });
});
