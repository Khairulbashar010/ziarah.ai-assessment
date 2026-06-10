import { createHash } from "crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildHotelBedsAuthHeaders } from "./auth";

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
  });
});
