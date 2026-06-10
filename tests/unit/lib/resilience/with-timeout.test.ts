import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "@/lib/resilience/with-timeout";

describe("TimeoutError", () => {
  it("uses the default message", () => {
    const error = new TimeoutError();
    expect(error.name).toBe("TimeoutError");
    expect(error.message).toBe("Operation timed out");
  });

  it("accepts a custom message", () => {
    expect(new TimeoutError("custom").message).toBe("custom");
  });
});

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the promise completes in time", async () => {
    vi.useFakeTimers();
    const result = withTimeout(Promise.resolve("ok"), 1000);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe("ok");
  });

  it("rejects with TimeoutError when the promise is slow", async () => {
    vi.useFakeTimers();

    const pending = new Promise<string>(() => {});
    const result = withTimeout(pending, 500, "search");

    const assertion = expect(result).rejects.toThrow("search timed out");
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it("rejects with default TimeoutError when no label is provided", async () => {
    vi.useFakeTimers();

    const pending = new Promise<string>(() => {});
    const result = withTimeout(pending, 250);

    const assertion = expect(result).rejects.toThrow("Operation timed out");
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it("resolves when the wrapped promise rejects before timing out", async () => {
    const error = new Error("provider failed");
    await expect(withTimeout(Promise.reject(error), 1000)).rejects.toThrow("provider failed");
  });

  it("skips clearTimeout when no timer handle was assigned", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
      (callback as () => void)();
      return undefined as unknown as ReturnType<typeof setTimeout>;
    });

    const pending = new Promise<string>(() => {});
    await expect(withTimeout(pending, 500)).rejects.toThrow(TimeoutError);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
    vi.mocked(setTimeout).mockRestore();
  });
});
