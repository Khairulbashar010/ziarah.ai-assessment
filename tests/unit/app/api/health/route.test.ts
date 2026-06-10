import { describe, it, expect, afterEach, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import * as redis from "@/lib/storage/redis";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns ok status with service metadata", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_LLM", "true");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.redis).toBe("ok");
    expect(body.service).toBe("ziarah-trip-search");
    expect(body.mockProviders).toBe(true);
    expect(body.mockLlm).toBe(true);
    expect(body.providerMocks).toBeDefined();
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reflects MOCK_PROVIDERS=false when set", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("MOCK_LLM", "false");

    const response = await GET();
    const body = await response.json();

    expect(body.mockProviders).toBe(false);
    expect(body.mockLlm).toBe(false);
  });

  it("defaults mockProviders to true when env is unset", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "");
    vi.stubEnv("MOCK_LLM", "");

    const response = await GET();
    const body = await response.json();

    expect(body.mockProviders).toBe(true);
    expect(body.mockLlm).toBe(false);
  });

  it("returns degraded status when Redis ping fails", async () => {
    vi.spyOn(redis, "pingRedis").mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.redis).toBe("error");
  });
});
