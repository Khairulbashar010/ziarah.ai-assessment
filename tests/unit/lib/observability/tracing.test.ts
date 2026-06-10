import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("observability tracing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("OTEL_ENABLED", "true");
    delete process.env.VITEST;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITEST", "true");
    vi.stubEnv("OTEL_ENABLED", "false");
  });

  it("runs work inside named spans when enabled", async () => {
    const tracing = await import("@/lib/observability/tracing");
    await tracing.initTracing();

    const result = await tracing.withSpan("trip.search", async () => "ok", {
      requestId: "req-1",
    });

    expect(result).toBe("ok");
    expect(tracing.tracingEnabled()).toBe(true);
  });

  it("extracts W3C trace context from headers", async () => {
    const tracing = await import("@/lib/observability/tracing");
    const headers = new Headers({
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    });

    expect(() => tracing.extractTraceContext(headers)).not.toThrow();
  });

  it("is disabled during vitest by default", async () => {
    vi.stubEnv("VITEST", "true");
    const tracing = await import("@/lib/observability/tracing");
    expect(tracing.tracingEnabled()).toBe(false);
  });
});
