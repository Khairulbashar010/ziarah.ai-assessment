import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clientMaxFlightOffers,
  clientMaxHotelOffers,
} from "@/lib/trip-search/offer-limits";

describe("offer limits", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses default flight offer cap", () => {
    expect(clientMaxFlightOffers()).toBe(50);
  });

  it("uses default hotel offer cap", () => {
    expect(clientMaxHotelOffers()).toBe(30);
  });

  it("reads flight offer cap from env", () => {
    vi.stubEnv("CLIENT_MAX_FLIGHT_OFFERS", "25");
    expect(clientMaxFlightOffers()).toBe(25);
  });

  it("reads hotel offer cap from env", () => {
    vi.stubEnv("CLIENT_MAX_HOTEL_OFFERS", "15");
    expect(clientMaxHotelOffers()).toBe(15);
  });
});
