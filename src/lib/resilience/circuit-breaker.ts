type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: CircuitState = "closed";

  constructor(
    private readonly threshold = 3,
    private readonly resetMs = 30_000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure > this.resetMs) {
        this.state = "half-open";
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure() {
    this.failures += 1;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "open";
    }
  }

  getState() {
    return this.state;
  }
}
