import { describe, it, expect, vi, afterEach } from "vitest";
import { CircuitBreaker } from "@/lib/resilience/circuit-breaker";

describe("CircuitBreaker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens after consecutive failures and rejects fast", async () => {
    const breaker = new CircuitBreaker(3, 30_000);
    const fail = () => Promise.reject(new Error("upstream down"));

    await expect(breaker.execute(fail)).rejects.toThrow("upstream down");
    await expect(breaker.execute(fail)).rejects.toThrow("upstream down");
    await expect(breaker.execute(fail)).rejects.toThrow("upstream down");

    expect(breaker.getState()).toBe("open");
    await expect(breaker.execute(fail)).rejects.toThrow("Circuit breaker is open");
  });

  it("closes again after a successful probe in half-open state", async () => {
    vi.useFakeTimers();

    const breaker = new CircuitBreaker(2, 1_000);
    const fail = () => Promise.reject(new Error("fail"));
    const ok = () => Promise.resolve("ok");

    await expect(breaker.execute(fail)).rejects.toThrow();
    await expect(breaker.execute(fail)).rejects.toThrow();
    expect(breaker.getState()).toBe("open");

    vi.advanceTimersByTime(1_001);
    await expect(breaker.execute(ok)).resolves.toBe("ok");
    expect(breaker.getState()).toBe("closed");
  });
});
