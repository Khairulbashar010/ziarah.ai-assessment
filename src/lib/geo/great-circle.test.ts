import { describe, expect, it } from "vitest";
import { greatCircleMidpoint, haversineKm } from "./great-circle";

describe("greatCircleMidpoint", () => {
  it("lies between Dubai and London airports", () => {
    const dxb = { lat: 25.2509, lon: 55.3629 };
    const lhr = { lat: 51.4703, lon: -0.45342 };
    const mid = greatCircleMidpoint(dxb, lhr);

    const originToMid = haversineKm(dxb, mid);
    const midToDest = haversineKm(mid, lhr);
    const total = haversineKm(dxb, lhr);

    expect(originToMid).toBeGreaterThan(1000);
    expect(midToDest).toBeGreaterThan(1000);
    expect(originToMid + midToDest).toBeCloseTo(total, -1);
  });
});
