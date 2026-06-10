import { createHash } from "crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildHotelBedsAuthHeaders, getHotelBedsBaseUrl } from "@/lib/providers/hotelbeds/auth";

describe("buildHotelBedsAuthHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds Api-key and deterministic X-Signature", () => {
    vi.stubEnv("HOTELBEDS_API_KEY", "test-key");
    vi.stubEnv("HOTELBEDS_API_SECRET", "test-secret");

    const headers = buildHotelBedsAuthHeaders(1_700_000_000_000);
    const expected = createHash("sha256").update("test-keytest-secret1700000000").digest("hex");

    expect(headers["Api-key"]).toBe("test-key");
    expect(headers["X-Signature"]).toBe(expected);
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("throws when HotelBeds credentials are missing", () => {
    vi.stubEnv("HOTELBEDS_API_KEY", "");

    expect(() => buildHotelBedsAuthHeaders()).toThrow(/credentials missing/);
    expect(() => getHotelBedsBaseUrl()).toThrow(/credentials missing/);
  });
});

describe("getHotelBedsBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the test API host", () => {
    vi.stubEnv("HOTELBEDS_API_KEY", "test-key");
    vi.stubEnv("HOTELBEDS_API_SECRET", "test-secret");

    expect(getHotelBedsBaseUrl()).toBe("https://api.test.hotelbeds.com");
  });

  it("uses HOTELBEDS_BASE_URL when set to production", () => {
    vi.stubEnv("HOTELBEDS_API_KEY", "test-key");
    vi.stubEnv("HOTELBEDS_API_SECRET", "test-secret");
    vi.stubEnv("HOTELBEDS_BASE_URL", "https://api.hotelbeds.com");

    expect(getHotelBedsBaseUrl()).toBe("https://api.hotelbeds.com");
  });
});
