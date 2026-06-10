import { context, propagation, trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const SERVICE_NAME = process.env.SERVICE_NAME ?? "ziarah-trip-search";

const globalTracing = globalThis as { __ziarahTracingInitialized?: boolean };

function isTracingEnabled(): boolean {
  return process.env.OTEL_ENABLED !== "false" && process.env.VITEST !== "true";
}

export function tracingEnabled(): boolean {
  return isTracingEnabled();
}

export async function initTracing(): Promise<void> {
  if (!isTracingEnabled() || globalTracing.__ziarahTracingInitialized) {
    return;
  }

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
    }),
    spanProcessors: [createSpanProcessor()],
  });

  provider.register();
  globalTracing.__ziarahTracingInitialized = true;
}

function createSpanProcessor(): BatchSpanProcessor {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (endpoint) {
    return new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: endpoint.endsWith("/v1/traces") ? endpoint : `${endpoint.replace(/\/$/, "")}/v1/traces`,
      }),
    );
  }

  if (process.env.OTEL_TRACES_EXPORTER === "console" || process.env.NODE_ENV !== "production") {
    return new BatchSpanProcessor(new ConsoleSpanExporter());
  }

  return new BatchSpanProcessor(new OTLPTraceExporter());
}

export function extractTraceContext(headers: Headers | { get(name: string): string | null }): ReturnType<typeof propagation.extract> {
  const carrier: Record<string, string> = {};
  const traceparent = headers.get("traceparent");
  const tracestate = headers.get("tracestate");

  if (traceparent) {
    carrier.traceparent = traceparent;
  }
  if (tracestate) {
    carrier.tracestate = tracestate;
  }

  return propagation.extract(context.active(), carrier);
}

export function getTracer() {
  return trace.getTracer(SERVICE_NAME);
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  if (!isTracingEnabled()) {
    return fn(trace.getTracer(SERVICE_NAME).startSpan(name));
  }

  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          span.setAttribute(key, value);
        }
      }

      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
      }
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (!span) return;

  for (const [key, value] of Object.entries(attributes)) {
    span.setAttribute(key, value);
  }
}
