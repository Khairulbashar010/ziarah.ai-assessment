import { afterEach, describe, expect, it, vi } from "vitest";
import { buildChatSearchUrl, navigateToTripSearch } from "@/lib/client/navigate-to-trip";

describe("buildChatSearchUrl", () => {
  it("builds a chat search URL with encoded query", () => {
    expect(buildChatSearchUrl(" Dubai to London ", "req-123")).toBe(
      "/chat/req-123?q=Dubai%20to%20London&search=1",
    );
  });

  it("generates a request id when one is not provided", () => {
    const url = buildChatSearchUrl("Dubai to London");
    expect(url).toMatch(/^\/chat\/[0-9a-f-]{36}\?q=Dubai%20to%20London&search=1$/);
  });
});

describe("navigateToTripSearch", () => {
  const assign = vi.fn();

  afterEach(() => {
    assign.mockReset();
    vi.unstubAllGlobals();
  });

  it("assigns the chat search URL for non-empty queries", () => {
    vi.stubGlobal("window", { location: { assign } });

    navigateToTripSearch("Dubai to London", "req-nav");

    expect(assign).toHaveBeenCalledWith("/chat/req-nav?q=Dubai%20to%20London&search=1");
  });

  it("does nothing for blank queries", () => {
    vi.stubGlobal("window", { location: { assign } });

    navigateToTripSearch("   ");

    expect(assign).not.toHaveBeenCalled();
  });
});
