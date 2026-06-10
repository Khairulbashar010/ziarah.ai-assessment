import { describe, it, expect, afterEach, vi } from "vitest";
import { getProviderMockStatus, shouldMockProvider } from "@/lib/providers/provider-mode";

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

describe("getProviderMockStatus", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults all providers to mock when MOCK_PROVIDERS is unset", () => {
    delete process.env.MOCK_PROVIDERS;
    delete process.env.MOCK_SABRE;
    delete process.env.MOCK_AMADEUS;
    delete process.env.MOCK_HOTELBEDS;

    expect(getProviderMockStatus()).toEqual({
      sabre: true,
      amadeus: true,
      hotelbeds: true,
    });
  });

  it("returns mock status for every provider", () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("MOCK_AMADEUS", "true");
    vi.stubEnv("MOCK_SABRE", "false");
    vi.stubEnv("MOCK_HOTELBEDS", "true");

    expect(getProviderMockStatus()).toEqual({
      sabre: false,
      amadeus: true,
      hotelbeds: true,
    });
  });
});
