import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("observability metrics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("METRICS_ENABLED", "true");
    delete process.env.VITEST;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITEST", "true");
  });

  it("exports prometheus text from /api/metrics helpers", async () => {
    const metrics = await import("@/lib/observability/metrics");
    expect(metrics.metricsEnabled()).toBe(true);

    metrics.recordTripSearchComplete({
      route: "/api/trips/search",
      statusCode: 200,
      durationMs: 1200,
      cacheStatus: "miss",
    });
    metrics.recordProviderResult({
      provider: "sabre",
      status: "success",
      durationMs: 400,
    });
    metrics.recordCacheLookup("miss");
    metrics.setCircuitBreakerState("sabre", "closed");
    metrics.setRedisConnectionUp(true);

    const body = await metrics.getMetricsText();
    expect(body).toContain("trip_search_duration_ms");
    expect(body).toContain("provider_duration_ms");
    expect(body).toContain("cache_operations_total");
    expect(body).toContain('status_code="200"');
  });

  it("is disabled during vitest by default", async () => {
    vi.stubEnv("VITEST", "true");
    const metrics = await import("@/lib/observability/metrics");
    expect(metrics.metricsEnabled()).toBe(false);
    expect(await metrics.getMetricsText()).toBe("");
  });
});
