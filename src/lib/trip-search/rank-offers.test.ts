import { describe, it, expect } from "vitest";
import { rankFlightOffers } from "./rank-offers";
import type { UnifiedFlightOffer } from "@/lib/types/trip";

function flight(
  id: string,
  overrides: Partial<UnifiedFlightOffer> = {},
): UnifiedFlightOffer {
  return {
    id,
    provider: "sabre",
    totalPrice: 1000,
    currency: "USD",
    perPassenger: 500,
    validatingCarrier: "EK",
    stops: 0,
    durationMinutes: 480,
    segments: [],
    refundable: false,
    raw: {},
    ...overrides,
  };
}

describe("rankFlightOffers", () => {
  it("ranks faster routes above slower ones regardless of provider order", () => {
    const sabreSlow = flight("sabre-slow", {
      provider: "sabre",
      durationMinutes: 720,
      totalPrice: 800,
    });
    const amadeusFast = flight("amadeus-fast", {
      provider: "amadeus",
      durationMinutes: 420,
      totalPrice: 950,
    });

    const ranked = rankFlightOffers([sabreSlow, amadeusFast]);

    expect(ranked[0].id).toBe("amadeus-fast");
    expect(ranked[1].id).toBe("sabre-slow");
  });

  it("breaks duration ties with fewer stops, then price", () => {
    const a = flight("a", { stops: 1, totalPrice: 900, durationMinutes: 480 });
    const b = flight("b", { stops: 0, totalPrice: 1000, durationMinutes: 480 });
    const c = flight("c", { stops: 0, totalPrice: 850, durationMinutes: 480 });

    const ranked = rankFlightOffers([a, b, c]);

    expect(ranked.map((o) => o.id)).toEqual(["c", "b", "a"]);
  });
});
