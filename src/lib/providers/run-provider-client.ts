import { CircuitBreaker } from "@/lib/resilience/circuit-breaker";
import { mockLatency } from "@/mocks/middleware/latency";
import { shouldMockProvider, type ProviderId } from "@/lib/providers/provider-mode";

const breakers = new Map<string, CircuitBreaker>();

function getBreaker(name: string): CircuitBreaker {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker();
    breakers.set(name, breaker);
  }
  return breaker;
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
  return getBreaker(name).execute(async () => {
    if (options.shouldError?.(params)) {
      throw new Error(options.errorMessage ?? `${name} validation error`);
    }

    if (shouldMockProvider(provider)) {
      await mockLatency();

      if (options.shouldFail?.(params)) {
        throw new Error(options.failMessage ?? `${name} unavailable`);
      }

      return await options.mock(params);
    }

    return options.live(params);
  });
}
