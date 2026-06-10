import { describe, it, expect, afterEach, vi } from "vitest";
import { shouldMockProvider } from "./provider-mode";

describe("shouldMockProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mocks all providers when MOCK_PROVIDERS is not false", () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    expect(shouldMockProvider("amadeus")).toBe(true);
    expect(shouldMockProvider("sabre")).toBe(true);
  });

  it("allows per-provider mock when MOCK_PROVIDERS is false", () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("MOCK_AMADEUS", "true");
    expect(shouldMockProvider("amadeus")).toBe(true);
    expect(shouldMockProvider("sabre")).toBe(false);
  });

  it("allows per-provider live override when global mock is true", () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("MOCK_SABRE", "false");
    expect(shouldMockProvider("sabre")).toBe(false);
    expect(shouldMockProvider("amadeus")).toBe(true);
  });
});
