import { afterEach, describe, expect, it, vi } from "vitest";
import { mockLatency } from "@/mocks/middleware/latency";

describe("mockLatency", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("waits within the default mock latency range", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const promise = mockLatency();
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(Math.random).toHaveBeenCalled();
  });

  it("respects custom min and max latency env values", async () => {
    vi.useFakeTimers();
    vi.stubEnv("MOCK_LATENCY_MS_MIN", "100");
    vi.stubEnv("MOCK_LATENCY_MS_MAX", "200");
    vi.spyOn(Math, "random").mockReturnValue(0);

    const promise = mockLatency();
    await vi.advanceTimersByTimeAsync(100);
    await promise;
  });
});
