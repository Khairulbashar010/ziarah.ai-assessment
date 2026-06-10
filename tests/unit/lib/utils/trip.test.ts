import { describe, expect, it } from "vitest";
import { totalPassengers } from "@/lib/utils/trip";

describe("totalPassengers", () => {
  it("sums adults and children", () => {
    expect(totalPassengers({ adults: 2, children: 1, infants: 0 })).toBe(3);
  });

  it("excludes infants from the total", () => {
    expect(totalPassengers({ adults: 1, children: 0, infants: 2 })).toBe(1);
  });
});
