import { setCircuitBreakerState } from "@/lib/observability/metrics";
import { CircuitBreaker } from "@/lib/resilience/circuit-breaker";
import { mockLatency } from "@/mocks/middleware/latency";
import { shouldMockProvider, type ProviderId } from "@/lib/providers/provider-mode";

const breakers = new Map<string, CircuitBreaker>();

function syncBreakerGauge(name: string, breaker: CircuitBreaker): void {
  setCircuitBreakerState(name, breaker.getState());
}

function getBreaker(name: string): CircuitBreaker {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker();
    breakers.set(name, breaker);
    syncBreakerGauge(name, breaker);
  }
  return breaker;
}

export function listProviderBreakerStates(): Array<{ name: string; state: ReturnType<CircuitBreaker["getState"]> }> {
  return [...breakers.entries()].map(([name, breaker]) => ({
    name,
    state: breaker.getState(),
  }));
}

type ProviderClientOptions<TParams> = {
  shouldError?: (params: TParams) => boolean;
  errorMessage?: string;
  shouldFail?: (params: TParams) => boolean;
  failMessage?: string;
  mock: (params: TParams) => unknown | Promise<unknown>;
  live: (params: TParams) => Promise<unknown>;
};

export function runProviderClient<TParams>(
  name: string,
  provider: ProviderId,
  params: TParams,
  options: ProviderClientOptions<TParams>,
): Promise<unknown> {
  const breaker = getBreaker(name);
  return breaker.execute(async () => {
    if (options.shouldError?.(params)) {
      throw new Error(options.errorMessage ?? `${name} validation error`);
    }

    if (shouldMockProvider(provider)) {
      await mockLatency();

      const failureRate = Number(process.env.MOCK_FAILURE_RATE ?? 0);
      if (failureRate > 0 && Math.random() < failureRate) {
        throw new Error(options.failMessage ?? `${name} unavailable`);
      }

      if (options.shouldFail?.(params)) {
        throw new Error(options.failMessage ?? `${name} unavailable`);
      }

      return await options.mock(params);
    }

    return options.live(params);
  }).finally(() => {
    syncBreakerGauge(name, breaker);
  });
}
