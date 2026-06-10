import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import pino from "pino";

describe("observability logger", () => {
  const write = vi.fn();
  let destination: pino.DestinationStream;

  beforeEach(() => {
    write.mockClear();
    destination = {
      write(chunk: string) {
        write(chunk);
      },
    } as pino.DestinationStream;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadLogger(env: Record<string, string | undefined> = {}) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        vi.unstubAllEnvs();
      } else {
        vi.stubEnv(key, value);
      }
    }
    return import("@/lib/observability/logger");
  }

  it("defaults to info in production and debug otherwise", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.LOG_LEVEL;
    const prod = await loadLogger({});
    expect(prod.rootLogger.level).toBe("info");

    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.LOG_LEVEL;
    const dev = await loadLogger({});
    expect(dev.rootLogger.level).toBe("debug");
  });

  it("respects LOG_LEVEL override including silent", async () => {
    const mod = await loadLogger({ LOG_LEVEL: "warn" });
    expect(mod.rootLogger.level).toBe("warn");

    vi.resetModules();
    const silent = await loadLogger({ LOG_LEVEL: "silent" });
    expect(silent.rootLogger.level).toBe("silent");
  });

  it("creates child loggers with request context", async () => {
    const { requestLogger } = await loadLogger({ LOG_LEVEL: "info", SERVICE_NAME: "test-service" });
    const child = requestLogger("req-1", "/api/trips/search");
    expect(child.bindings()).toMatchObject({
      service: "test-service",
      requestId: "req-1",
      route: "/api/trips/search",
    });
  });

  it("emits structured search, llm parse, and provider events", async () => {
    const {
      rootLogger,
      logSearchStart,
      logSearchComplete,
      logProviderResult,
      logLlmParseComplete,
      logLlmParseFallback,
    } = await loadLogger();
    const log = rootLogger.child({ requestId: "r1", route: "/api/trips/search" });
    const spy = vi.spyOn(log, "info");

    logSearchStart(log, { queryLength: 42, hasContext: true });
    logSearchComplete(log, { durationMs: 100, statusCode: 200, cacheStatus: "miss", providersSucceeded: 3 });
    logProviderResult(log, {
      provider: "sabre",
      status: "success",
      offerCount: 5,
      durationMs: 200,
    });
    logLlmParseComplete(log, {
      durationMs: 120,
      timeoutMs: 800,
      mode: "sync",
      cachedPromptTokens: 512,
    });
    const warnSpy = vi.spyOn(log, "warn");
    logLlmParseFallback(log, { reason: "timeout", timeoutMs: 800, mode: "sync" });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "search_start", queryLength: 42, hasContext: true }),
      "trip search started",
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "search_complete", statusCode: 200 }),
      "trip search completed",
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "provider_result", provider: "sabre" }),
      "provider sabre success",
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "llm_parse_complete", cachedPromptTokens: 512 }),
      "openai trip parse completed",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "llm_parse_fallback", reason: "timeout" }),
      "openai trip parse failed — using regex fallback",
    );
  });

  it("logs api errors for Error and non-Error values", async () => {
    const { rootLogger, logApiError } = await loadLogger();
    const log = rootLogger.child({ requestId: "r1", route: "/api/trips/search" });
    const errorSpy = vi.spyOn(log, "error");

    logApiError(log, {
      event: "internal_error",
      statusCode: 500,
      durationMs: 10,
      err: new Error("boom"),
      message: "failed",
    });
    logApiError(log, {
      event: "validation_error",
      statusCode: 400,
      durationMs: 5,
      err: "bad",
      message: "invalid",
    });
    logApiError(log, {
      event: "trip_not_found",
      statusCode: 404,
      durationMs: 2,
      message: "missing",
    });

    expect(errorSpy).toHaveBeenCalledTimes(3);
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: "internal_error",
      err: expect.objectContaining({ message: "boom" }),
    });
    expect(errorSpy.mock.calls[1][0]).toMatchObject({ err: "bad" });
    expect(errorSpy.mock.calls[2][0]).toMatchObject({ event: "trip_not_found" });
  });

  it("logs quorum failures, cache refresh issues, and redis errors", async () => {
    const {
      rootLogger,
      logQuorumFailure,
      logCacheRefreshFailure,
      logProviderResult,
      logRedisError,
    } = await loadLogger();
    const log = rootLogger.child({ requestId: "r1", route: "/api/trips/search" });
    const errorSpy = vi.spyOn(log, "error");
    const warnSpy = vi.spyOn(log, "warn");
    const rootErrorSpy = vi.spyOn(rootLogger, "error");

    logQuorumFailure(log, {
      providersSucceeded: 1,
      providersRequired: 2,
      providerTimeoutMs: 2500,
      failedProviders: [{ name: "sabre", status: "timeout", durationMs: 2500 }],
    });
    logCacheRefreshFailure(log, new Error("refresh"), "stale");
    logCacheRefreshFailure(log, "oops", "background");
    logProviderResult(log, {
      provider: "amadeus",
      status: "timeout",
      offerCount: 0,
      durationMs: 2500,
      error: "timed out",
    });
    logRedisError(new Error("connection reset"));
    logRedisError("unknown");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "quorum_failure", providersSucceeded: 1 }),
      expect.any(String),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "cache_refresh_failed", context: "stale" }),
      "stale cache refresh failed",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "cache_refresh_failed", context: "background" }),
      "cache refresh failed",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "provider_result", provider: "amadeus", status: "timeout" }),
      "provider amadeus timeout",
    );
    expect(rootErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_error", err: expect.objectContaining({ message: "connection reset" }) }),
      "redis client error",
    );
    expect(rootErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_error", err: "unknown" }),
      "redis client error",
    );
  });
});
