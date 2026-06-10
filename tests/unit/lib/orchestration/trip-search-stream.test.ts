import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  searchTrip,
  searchTripStream,
  QuorumError,
} from "@/lib/orchestration/trip-search-service";
import {
  clearTripSearchCache,
  saveTripSearchCache,
} from "@/lib/storage/trip-query-cache";
import type { TripSearchStreamEvent } from "@/lib/trip-search/stream-events";

const QUERY = "family of 4 from Dubai to London, December 20-27, budget $3000";

async function collectStreamEvents(
  query: string,
  requestId = "stream-req",
): Promise<TripSearchStreamEvent[]> {
  const events: TripSearchStreamEvent[] = [];
  for await (const event of searchTripStream(query, requestId)) {
    events.push(event);
  }
  return events;
}

describe("searchTripStream", () => {
  beforeEach(async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LLM", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");
    vi.stubEnv("TRIP_SEARCH_CACHE_TTL_MS", "600000");
    await clearTripSearchCache();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await clearTripSearchCache();
  });

  it("serves fresh cache without calling providers", async () => {
    await searchTrip(QUERY, "seed-req");
    const events = await collectStreamEvents(QUERY, "fresh-req");

    const statuses = events.filter((e) => e.type === "status");
    const complete = events.find((e) => e.type === "complete");

    expect(statuses.some((s) => s.type === "status" && s.message.includes("cached"))).toBe(true);
    expect(complete?.type).toBe("complete");
    expect(events.some((e) => e.type === "provider")).toBe(false);
  });

  it("serves stale cache then refreshes in the background", async () => {
    const first = await searchTrip(QUERY, "stale-seed");
    const staleCachedAt = Date.now() - 25 * 60 * 1000;
    await saveTripSearchCache(first.parsedQuery, first, staleCachedAt);

    const events = await collectStreamEvents(QUERY, "stale-req");

    expect(events.some((e) => e.type === "status" && e.message.includes("cached prices"))).toBe(
      true,
    );
    expect(events.filter((e) => e.type === "complete").length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === "offers_update")).toBe(true);
    expect(events.some((e) => e.type === "status" && e.message === "Prices updated")).toBe(true);
  });

  it("streams provider events on cache miss", async () => {
    const events = await collectStreamEvents(QUERY, "miss-req");

    const providerEvents = events.filter((e) => e.type === "provider");
    expect(providerEvents.length).toBe(3);
    expect(providerEvents.map((e) => (e.type === "provider" ? e.provider : ""))).toEqual(
      expect.arrayContaining(["sabre", "amadeus", "hotelbeds"]),
    );
    expect(events.some((e) => e.type === "offers_update")).toBe(true);
    expect(events.at(-1)?.type).toBe("complete");
  });

  it("throws QuorumError when fewer than 2 providers succeed", async () => {
    const error = await collectStreamEvents(
      "family of 4 from fail to London, December 20-27, budget $3000",
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(QuorumError);
  });

  it("skips refresh update when background refresh fails for stale cache", async () => {
    const first = await searchTrip(QUERY, "stale-fail-seed");
    await saveTripSearchCache(first.parsedQuery, first, Date.now() - 25 * 60 * 1000);

    const sabreClient = await import("@/lib/providers/sabre/client");
    const amadeusClient = await import("@/lib/providers/amadeus/client");
    const sabreSpy = vi
      .spyOn(sabreClient, "searchSabreFlights")
      .mockRejectedValue(new Error("Sabre down"));
    const amadeusSpy = vi
      .spyOn(amadeusClient, "searchAmadeusFlights")
      .mockRejectedValue(new Error("Amadeus down"));

    const events = await collectStreamEvents(QUERY, "stale-refresh-fail");

    expect(events.some((e) => e.type === "status" && e.message === "Prices updated")).toBe(false);
    expect(events.filter((e) => e.type === "complete").length).toBe(1);

    sabreSpy.mockRestore();
    amadeusSpy.mockRestore();
  });
});
