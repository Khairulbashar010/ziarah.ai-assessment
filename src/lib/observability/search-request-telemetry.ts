import { context as otelContext } from "@opentelemetry/api";
import {
  decrementInflightRequests,
  incrementInflightRequests,
  recordTripSearchComplete,
} from "@/lib/observability/metrics";
import { extractTraceContext, withSpan } from "@/lib/observability/tracing";

type SearchTelemetryOptions = {
  route: string;
  requestId: string;
  headers: Headers | { get(name: string): string | null };
  run: () => Promise<void>;
};

export async function runSearchWithTelemetry(options: SearchTelemetryOptions): Promise<void> {
  const parentContext = extractTraceContext(options.headers);

  return otelContext.with(parentContext, async () =>
    withSpan("trip.search", async (span) => {
      span.setAttribute("requestId", options.requestId);
      span.setAttribute("route", options.route);

      incrementInflightRequests();
      try {
        await options.run();
      } finally {
        decrementInflightRequests();
      }
    }),
  );
}

export function finalizeSearchMetrics(details: {
  route: string;
  statusCode: number;
  started: number;
  cacheStatus?: string;
}): void {
  recordTripSearchComplete({
    route: details.route,
    statusCode: details.statusCode,
    durationMs: Date.now() - details.started,
    cacheStatus: details.cacheStatus,
  });
}
