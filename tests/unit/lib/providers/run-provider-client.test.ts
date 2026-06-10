import { afterEach, describe, expect, it, vi } from "vitest";
import { runProviderClient } from "@/lib/providers/run-provider-client";

describe("runProviderClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const params = { code: "DXB" };

  it("throws validation error when shouldError matches", async () => {
    await expect(
      runProviderClient("TestProvider-validation", "sabre", { code: "ERR" }, {
        shouldError: (p) => p.code === "ERR",
        errorMessage: "validation failed",
        mock: () => ({ ok: true }),
        live: async () => ({ ok: true }),
      }),
    ).rejects.toThrow("validation failed");
  });

  it("uses default validation message when errorMessage is omitted", async () => {
    await expect(
      runProviderClient("TestProvider-default-validation", "sabre", { code: "ERR" }, {
        shouldError: (p) => p.code === "ERR",
        mock: () => ({ ok: true }),
        live: async () => ({ ok: true }),
      }),
    ).rejects.toThrow("TestProvider-default-validation validation error");
  });

  it("returns mock handler output when mocking is enabled", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    const result = await runProviderClient("TestProvider-mock", "amadeus", params, {
      mock: () => ({ mocked: true }),
      live: async () => ({ live: true }),
    });

    expect(result).toEqual({ mocked: true });
  });

  it("throws unavailable when shouldFail matches in mock mode", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    await expect(
      runProviderClient("TestProvider-should-fail", "hotelbeds", { code: "FAIL" }, {
        shouldFail: (p) => p.code === "FAIL",
        failMessage: "provider down",
        mock: () => ({ ok: true }),
        live: async () => ({ ok: true }),
      }),
    ).rejects.toThrow("provider down");
  });

  it("uses default fail message when failMessage is omitted", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");

    await expect(
      runProviderClient("TestProvider-default-fail", "sabre", { code: "FAIL" }, {
        shouldFail: (p) => p.code === "FAIL",
        mock: () => ({ ok: true }),
        live: async () => ({ ok: true }),
      }),
    ).rejects.toThrow("TestProvider-default-fail unavailable");
  });

  it("skips random failure when MOCK_FAILURE_RATE roll misses", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");
    vi.stubEnv("MOCK_FAILURE_RATE", "0.5");
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const result = await runProviderClient("TestProvider-random-pass", "sabre", params, {
      failMessage: "random outage",
      mock: () => ({ ok: true }),
      live: async () => ({ ok: true }),
    });

    expect(result).toEqual({ ok: true });
  });

  it("throws when MOCK_FAILURE_RATE triggers a random failure", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");
    vi.stubEnv("MOCK_FAILURE_RATE", "1");
    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(
      runProviderClient("TestProvider-random-fail", "sabre", params, {
        failMessage: "random outage",
        mock: () => ({ ok: true }),
        live: async () => ({ ok: true }),
      }),
    ).rejects.toThrow("random outage");
  });

  it("uses default fail message when MOCK_FAILURE_RATE triggers without failMessage", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "0");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "0");
    vi.stubEnv("MOCK_FAILURE_RATE", "1");
    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(
      runProviderClient("TestProvider-random-default-fail", "sabre", params, {
        mock: () => ({ ok: true }),
        live: async () => ({ ok: true }),
      }),
    ).rejects.toThrow("TestProvider-random-default-fail unavailable");
  });

  it("calls live handler when mocking is disabled", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("MOCK_SABRE", "false");

    const result = await runProviderClient("TestProvider-live", "sabre", params, {
      mock: () => ({ mocked: true }),
      live: async () => ({ live: true }),
    });

    expect(result).toEqual({ live: true });
  });
});
