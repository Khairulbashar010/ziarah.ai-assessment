import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("GET /api/metrics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    delete process.env.VITEST;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITEST", "true");
    vi.stubEnv("METRICS_ENABLED", "false");
  });

  it("returns prometheus exposition format when metrics are enabled", async () => {
    vi.stubEnv("METRICS_ENABLED", "true");
    const { GET } = await import("@/app/api/metrics/route");
    const { recordTripSearchComplete } = await import("@/lib/observability/metrics");

    recordTripSearchComplete({
      route: "/api/trips/search",
      statusCode: 200,
      durationMs: 500,
      cacheStatus: "fresh",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");

    const body = await response.text();
    expect(body).toContain("trip_search_total");
  });

  it("returns 404 when metrics are disabled", async () => {
    vi.stubEnv("METRICS_ENABLED", "false");
    const { GET } = await import("@/app/api/metrics/route");
    const response = await GET();
    expect(response.status).toBe(404);
  });
});
