import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

const SERVICE_NAME = process.env.SERVICE_NAME ?? "ziarah-trip-search";

type MetricsBundle = {
  register: Registry;
  tripSearchDurationMs: Histogram<"route" | "cache_status">;
  providerDurationMs: Histogram<"provider" | "status">;
  llmParseDurationMs: Histogram<"source">;
  tripSearchTotal: Counter<"status_code">;
  quorumFailuresTotal: Counter<string>;
  providerTimeoutsTotal: Counter<"provider">;
  cacheOperationsTotal: Counter<"result">;
  circuitBreakerState: Gauge<"provider">;
  httpInflightRequests: Gauge<string>;
  redisConnectionUp: Gauge<string>;
};

const globalMetrics = globalThis as { __ziarahMetrics?: MetricsBundle };

function isMetricsEnabled(): boolean {
  return process.env.METRICS_ENABLED !== "false" && process.env.VITEST !== "true";
}

function createMetrics(): MetricsBundle {
  const register = new Registry();
  register.setDefaultLabels({ service: SERVICE_NAME });

  collectDefaultMetrics({ register, prefix: "nodejs_" });

  const tripSearchDurationMs = new Histogram({
    name: "trip_search_duration_ms",
    help: "End-to-end trip search duration in milliseconds",
    labelNames: ["route", "cache_status"] as const,
    buckets: [50, 100, 250, 500, 800, 1000, 1500, 2000, 2500, 3000, 5000, 10000],
    registers: [register],
  });

  const providerDurationMs = new Histogram({
    name: "provider_duration_ms",
    help: "Provider call duration in milliseconds",
    labelNames: ["provider", "status"] as const,
    buckets: [50, 100, 250, 500, 800, 1000, 1500, 2000, 2500, 3000, 5000],
    registers: [register],
  });

  const llmParseDurationMs = new Histogram({
    name: "llm_parse_duration_ms",
    help: "LLM parse phase duration in milliseconds",
    labelNames: ["source"] as const,
    buckets: [25, 50, 100, 200, 400, 800, 1200, 2000, 5000, 12000],
    registers: [register],
  });

  const tripSearchTotal = new Counter({
    name: "trip_search_total",
    help: "Trip search requests by HTTP status code",
    labelNames: ["status_code"] as const,
    registers: [register],
  });

  const quorumFailuresTotal = new Counter({
    name: "quorum_failures_total",
    help: "Searches that failed the 2-of-3 provider quorum",
    registers: [register],
  });

  const providerTimeoutsTotal = new Counter({
    name: "provider_timeouts_total",
    help: "Provider calls that timed out",
    labelNames: ["provider"] as const,
    registers: [register],
  });

  const cacheOperationsTotal = new Counter({
    name: "cache_operations_total",
    help: "Trip search cache lookups by result",
    labelNames: ["result"] as const,
    registers: [register],
  });

  const circuitBreakerState = new Gauge({
    name: "circuit_breaker_state",
    help: "Circuit breaker state per provider (0=closed, 1=open, 2=half-open)",
    labelNames: ["provider"] as const,
    registers: [register],
  });

  const httpInflightRequests = new Gauge({
    name: "http_inflight_requests",
    help: "In-flight HTTP search requests",
    registers: [register],
  });

  const redisConnectionUp = new Gauge({
    name: "redis_connection_up",
    help: "Redis connectivity (1=ok, 0=error)",
    registers: [register],
  });

  return {
    register,
    tripSearchDurationMs,
    providerDurationMs,
    llmParseDurationMs,
    tripSearchTotal,
    quorumFailuresTotal,
    providerTimeoutsTotal,
    cacheOperationsTotal,
    circuitBreakerState,
    httpInflightRequests,
    redisConnectionUp,
  };
}

function getMetrics(): MetricsBundle | null {
  if (!isMetricsEnabled()) {
    return null;
  }

  if (!globalMetrics.__ziarahMetrics) {
    globalMetrics.__ziarahMetrics = createMetrics();
  }

  return globalMetrics.__ziarahMetrics;
}

export function metricsEnabled(): boolean {
  return getMetrics() !== null;
}

export async function getMetricsText(): Promise<string> {
  const metrics = getMetrics();
  if (!metrics) {
    return "";
  }
  return metrics.register.metrics();
}

export function recordTripSearchComplete(details: {
  route: string;
  statusCode: number;
  durationMs: number;
  cacheStatus?: string;
}): void {
  const metrics = getMetrics();
  if (!metrics) return;

  metrics.tripSearchTotal.inc({ status_code: String(details.statusCode) });
  metrics.tripSearchDurationMs.observe(
    {
      route: details.route,
      cache_status: details.cacheStatus ?? "unknown",
    },
    details.durationMs,
  );
}

export function recordQuorumFailure(): void {
  getMetrics()?.quorumFailuresTotal.inc();
}

export function recordProviderResult(details: {
  provider: string;
  status: string;
  durationMs: number;
}): void {
  const metrics = getMetrics();
  if (!metrics) return;

  metrics.providerDurationMs.observe(
    { provider: details.provider, status: details.status },
    details.durationMs,
  );

  if (details.status === "timeout") {
    metrics.providerTimeoutsTotal.inc({ provider: details.provider });
  }
}

export function recordLlmParse(details: { source: string; durationMs: number }): void {
  const metrics = getMetrics();
  if (!metrics) return;

  metrics.llmParseDurationMs.observe({ source: details.source }, details.durationMs);
}

export function recordCacheLookup(status: "fresh" | "stale" | "miss"): void {
  getMetrics()?.cacheOperationsTotal.inc({ result: status });
}

export function setCircuitBreakerState(provider: string, state: "closed" | "open" | "half-open"): void {
  const metrics = getMetrics();
  if (!metrics) return;

  const value = state === "closed" ? 0 : state === "open" ? 1 : 2;
  metrics.circuitBreakerState.set({ provider }, value);
}

export function incrementInflightRequests(): void {
  getMetrics()?.httpInflightRequests.inc();
}

export function decrementInflightRequests(): void {
  getMetrics()?.httpInflightRequests.dec();
}

export function setRedisConnectionUp(ok: boolean): void {
  getMetrics()?.redisConnectionUp.set(ok ? 1 : 0);
}
