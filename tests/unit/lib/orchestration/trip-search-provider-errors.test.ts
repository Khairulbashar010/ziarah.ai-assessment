import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearTripSearchCache } from "@/lib/storage/trip-query-cache";

const { searchSabreFlightsMock } = vi.hoisted(() => ({
  searchSabreFlightsMock: vi.fn(),
}));

vi.mock("@/lib/providers/sabre/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/sabre/client")>();
  return {
    ...actual,
    searchSabreFlights: searchSabreFlightsMock,
  };
});

const QUERY = "family of 4 from Dubai to London, December 20-27, budget $3000";

describe("trip search provider error handling", () => {
  beforeEach(async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LLM", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");
    vi.stubEnv("PROVIDER_TIMEOUT_MS", "1");
    await clearTripSearchCache();
    searchSabreFlightsMock.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await clearTripSearchCache();
  });

  it("marks timed-out providers separately from generic errors", async () => {
    searchSabreFlightsMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({}), 50)),
    );

    const { searchTrip } = await import("@/lib/orchestration/trip-search-service");
    const result = await searchTrip(QUERY, "timeout-req");

    expect(result.providers.sabre.status).toBe("timeout");
    expect(result.meta.providersSucceeded).toBeGreaterThanOrEqual(2);
  }, 10_000);

  it("records non-Error provider failures as unknown errors", async () => {
    searchSabreFlightsMock.mockImplementation(() => {
      throw "provider blew up";
    });

    const { searchTrip } = await import("@/lib/orchestration/trip-search-service");
    const result = await searchTrip(QUERY, "non-error-req");

    expect(result.providers.sabre.status).toBe("error");
    expect(result.providers.sabre.error).toBe("Unknown error");
    expect(result.meta.providersSucceeded).toBeGreaterThanOrEqual(2);
  });
});
