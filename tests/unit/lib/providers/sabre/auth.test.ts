import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSabreAccessToken,
  getSabrePcc,
  resetSabreTokenCacheForTests,
} from "@/lib/providers/sabre/auth";

describe("Sabre auth", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetSabreTokenCacheForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SABRE_CLIENT_ID", "client-id");
    vi.stubEnv("SABRE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("SABRE_PCC", "ABCD");
    delete process.env.SABRE_ENV;
  });

  afterEach(() => {
    resetSabreTokenCacheForTests();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns PCC from credentials", () => {
    expect(getSabrePcc()).toBe("ABCD");
  });

  it("throws when Sabre credentials are missing", async () => {
    vi.stubEnv("SABRE_CLIENT_ID", "");
    await expect(getSabreAccessToken()).rejects.toThrow(/credentials missing/);
    expect(() => getSabrePcc()).toThrow(/credentials missing/);
  });

  it("throws when Sabre PCC is missing", async () => {
    vi.stubEnv("SABRE_PCC", "");
    await expect(getSabreAccessToken()).rejects.toThrow(/PCC missing/);
    expect(() => getSabrePcc()).toThrow(/PCC missing/);
  });

  it("fetches a token from the test API by default", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    });

    const token = await getSabreAccessToken();

    expect(token).toBe("test-token");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.test.sabre.com/v2/auth/token",
    );
  });

  it("uses the production API when SABRE_ENV is prod", async () => {
    process.env.SABRE_ENV = "prod";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "prod-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    });

    await getSabreAccessToken();

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.sabre.com/v2/auth/token");
  });

  it("returns cached token on subsequent calls within TTL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "cached-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    });

    const first = await getSabreAccessToken();
    const second = await getSabreAccessToken();

    expect(first).toBe("cached-token");
    expect(second).toBe("cached-token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refetches after cache reset", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "first-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "second-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      });

    expect(await getSabreAccessToken()).toBe("first-token");
    resetSabreTokenCacheForTests();
    expect(await getSabreAccessToken()).toBe("second-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refetches after cache expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "expiring-token",
          token_type: "Bearer",
          expires_in: 120,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "fresh-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      });

    expect(await getSabreAccessToken()).toBe("expiring-token");
    vi.advanceTimersByTime(61_000);
    expect(await getSabreAccessToken()).toBe("fresh-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when Sabre auth fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "invalid_client",
    });

    await expect(getSabreAccessToken()).rejects.toThrow(
      "Sabre auth failed (401): invalid_client",
    );
  });
});
