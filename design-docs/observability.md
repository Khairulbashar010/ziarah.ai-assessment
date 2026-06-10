# Observability

How we observe trip search — keyed on `requestId` end to end.

---

## What's implemented today

| Signal | Tool | How to use it |
|--------|------|---------------|
| Structured logs | **pino** (`src/lib/observability/logger.ts`) | JSON to stdout; each request gets `requestId` + `route` |
| Log aggregation | **Promtail → Loki → Grafana** (Docker Compose) | `docker compose up` → Grafana on `:3001` |
| Dashboards | **Grafana** — Trip Search Logs | Filter by `requestId`, event type, provider |
| Metrics | **Prometheus** + `GET /api/metrics` | `prom-client` histograms/counters/gauges; scraped every 15s |
| Tracing | **OpenTelemetry** (`src/lib/observability/tracing.ts`) | Span tree rooted at `trip.search`; W3C `traceparent` at ingress |
| Alerts | **Prometheus rules** + **Grafana unified alerting** | `observability/prometheus/alerts.yml` + Grafana provisioning |
| Health | `GET /api/health` | Redis ping; 503 when Redis down; sets `redis_connection_up` gauge |
| Correlation | `X-Request-Id` header | Copy from API response → paste into Grafana |
| Duration | `X-Duration-Ms` header | Total search time on SSE responses |

**Compose stack:** app → Promtail → Loki → Grafana; Prometheus scrapes `/api/metrics`. Config lives under `observability/`. Run `docker compose up` for the full observability stack locally.

**Env toggles:** `METRICS_ENABLED` (default `true`), `OTEL_ENABLED` (default `true`), `OTEL_TRACES_EXPORTER=console` (Docker default), `OTEL_EXPORTER_OTLP_ENDPOINT` for OTLP export.

---

## Metrics

Prometheus scrapes `/api/metrics` for SLO tracking (`src/lib/observability/metrics.ts`).

**Histograms**

| Name | Labels | Use |
|------|--------|-----|
| `trip_search_duration_ms` | `route`, `cache_status` | p50/p95 vs 3s target |
| `provider_duration_ms` | `provider`, `status` | Which GDS is slow |
| `llm_parse_duration_ms` | `source` | Parse phase budget |

**Counters**

| Name | Labels | Use |
|------|--------|-----|
| `trip_search_total` | `status_code` | Error rate |
| `quorum_failures_total` | — | 503 tracking |
| `provider_timeouts_total` | `provider` | Upstream degradation |
| `cache_operations_total` | `result` (hit/miss/stale) | Cache effectiveness |

**Gauges**

| Name | Labels | Use |
|------|--------|-----|
| `circuit_breaker_state` | `provider` | 0=closed, 1=open, 2=half-open |
| `http_inflight_requests` | — | HPA custom metric (see [kubernetes.md](./kubernetes.md)) |

### Tracing

OpenTelemetry span tree on `@opentelemetry/sdk-trace-node` (initialized in `src/instrumentation.ts`):

```
trip.search
├── llm.parse
├── cache.lookup
├── provider.fanout
│   ├── provider.sabre → normalize.sabre
│   ├── provider.amadeus → normalize.amadeus
│   └── provider.hotelbeds → normalize.hotelbeds
├── provider.quorum_retry (optional)
├── rank + budget
└── package.response
```

W3C `traceparent` propagates at the ingress boundary (`extractTraceContext` in API routes). In K8s, Fluent Bit replaces Promtail and Tempo/X-Ray replaces the local OTLP collector — same signal paths.

### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| Latency | p95 > 3s for 5 min | Warning |
| Quorum failures | 503 rate > 5% for 5 min | Critical |
| Breaker stuck | Any open > 2 min | Warning |
| Provider timeouts | > 10/min per provider | Warning |
| Cache hit ratio | < 20% for 15 min | Info |
| Pod not ready | Readiness failing > 3 min | Critical |
| Redis down | `redis: "error"` on health > 1 min | Critical |

---

## Logging reference

pino via `src/lib/observability/logger.ts`. Each API request gets a child logger with `requestId` and `route`.

**Example — quorum retry**

```json
{
  "level": "warn",
  "timestamp": "2026-06-10T12:00:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "route": "/api/trips/search/stream",
  "event": "provider_quorum_retry",
  "providersSucceeded": 1,
  "providersRequired": 2,
  "retryingProviders": ["sabre", "amadeus"],
  "retryTimeoutMs": 1000
}
```

**Example — quorum failure**

```json
{
  "level": "error",
  "timestamp": "2026-06-10T12:00:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "route": "/api/trips/search/stream",
  "event": "quorum_failure",
  "providersSucceeded": 1,
  "failedProviders": ["sabre", "amadeus"],
  "durationMs": 3100,
  "cacheStatus": "miss"
}
```

### Event names you'll see

| Event | When |
|-------|------|
| `search_start` | Search begins — logs query **length**, not content |
| `llm_parse_complete` | OpenAI parse succeeded |
| `llm_parse_fallback` | Fell back to regex/modify parser |
| `provider_result` | One provider finished (`attempt: 2` on quorum retry) |
| `provider_quorum_retry` | Retrying failed providers |
| `quorum_failure` | Fewer than 2 providers succeeded |
| `search_complete` | Search finished |
| `cache_refresh_failed` | Background stale refresh failed |
| `redis_error` | Redis operation failed |

API-layer events: `validation_error`, `parse_error`, `global_timeout`, `internal_error`, `trip_not_found`.

### What we don't log

- Full natural-language queries (PII)
- API keys, OAuth tokens, HotelBeds signatures
- Provider `raw` payloads (passenger data)
- Stack traces to the client (server logs only)

---

## Debugging a search (step by step)

1. Run the app (`docker compose up` or `npm run dev`).
2. Perform a search in the UI or via curl.
3. Copy `X-Request-Id` from the response header.
4. Open Grafana → **Trip Search Logs** dashboard.
5. Paste the `requestId` into the dashboard variable.
6. Read events in order: `search_start` → `llm_parse_*` → `provider_result` × 3 → `search_complete` (or `quorum_failure`).

If Grafana isn't running, logs are still in stdout — pipe through `jq` and filter on `requestId`.
