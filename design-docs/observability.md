# Observability

How we observe trip search: logs, metrics, traces, and alerts — keyed on `requestId` end to end.

---

## Signals

| Signal | What runs |
|--------|--------|
| Structured logs | **pino** — JSON to stdout, keyed on `requestId` + `route` |
| Log aggregation | **Loki** via **Promtail** (Docker Compose) |
| Dashboards | **Grafana** — Trip Search Logs dashboard provisioned |
| API error events | `validation_error`, `parse_error`, `quorum_failure`, `global_timeout`, `internal_error`, `trip_not_found` |
| Orchestration events | `search_start`, `search_complete`, `provider_result`, `cache_refresh_failed`, `redis_error` |
| Health | `GET /api/health` — Redis ping, service name, timestamp, mock flags; 503 when Redis down |
| Correlation | `X-Request-Id` on SSE responses (generate at ingress if missing) |
| Duration | `X-Duration-Ms` on SSE responses |
| Metrics | Prometheus scrape on `/api/metrics` — search SLO, per-provider latency, quorum, breakers, cache |
| Tracing | OpenTelemetry — `trip.search` span tree; auto-instrumented `fetch` and incoming HTTP |
| Alerts | Grafana rules — p95 latency, quorum failure rate, breaker stuck open, Redis down |

**Compose stack** (`docker compose up`): app stdout → Promtail (Docker socket) → Loki → Grafana on `:3001`; Prometheus scrapes `/api/metrics`. Config under `observability/`. In K8s, Fluent Bit replaces Promtail and Tempo/X-Ray replaces the local collector — same signal paths.

---

## Stack

```
App pod → stdout (JSON logs) → Fluent Bit → Loki or CloudWatch
         → OTEL SDK → Collector → Tempo or X-Ray
         → Prometheus client → scrape → Grafana
```

Traces, metrics, and logs are keyed on `requestId`. W3C `traceparent` propagates at the ingress boundary.

---

## Tracing

**Span tree:**

```
trip.search
├── llm.parse
├── cache.lookup
├── provider.fanout
│   ├── provider.sabre → normalize.sabre
│   ├── provider.amadeus → normalize.amadeus
│   └── provider.hotelbeds → normalize.hotelbeds
├── rank + budget
└── package.response
```

**Span attributes**

| Span | Tags |
|------|------|
| `trip.search` | `requestId`, `route`, `cache.status`, `quorum.met`, `durationMs` |
| `llm.parse` | `model`, `mock`, `parse.source` (openai / regex / modify) |
| `provider.*` | `provider.name`, `status`, `offerCount`, `durationMs`, `circuitBreaker.state` |

Runs on `@opentelemetry/sdk-node` with auto-instrumentation for `fetch` and incoming HTTP.

---

## Metrics

**Histograms (SLO tracking)**

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

Exposed on `/api/metrics`. Grafana dashboards: search SLO panel + per-provider health panel.

---

## Logging

pino via `src/lib/observability/logger.ts`. Each API request gets a child logger with `requestId` and `route`. Schema:

```json
{
  "level": "error",
  "timestamp": "2026-06-10T12:00:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "route": "/api/trips/search/stream",
  "event": "quorum_failure",
  "providersSucceeded": 1,
  "failedProviders": ["sabre", "amadeus"],
  "durationMs": 2100,
  "cacheStatus": "miss"
}
```

**Log**

- Search start: `requestId`, route, query *length* (not content)
- Parse done: `llm_parse_complete` (with `cachedPromptTokens`) or `llm_parse_fallback` (`reason`, `mode`)
- Per provider: name, status, offer count, duration
- Quorum failure: which providers failed
- Breaker open: provider, consecutive failure count

**Don't log**

- Full natural-language queries (PII)
- API keys, OAuth tokens, HotelBeds signatures
- Provider `raw` payloads (passenger data)
- Stack traces to the client (server logs only)

---

## Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| Latency | p95 > 3s for 5 min | Warning |
| Quorum failures | 503 rate > 5% for 5 min | Critical |
| Breaker stuck | Any open > 2 min | Warning |
| Provider timeouts | > 10/min per provider | Warning |
| Cache hit ratio | < 20% for 15 min | Info (tune TTL or traffic pattern) |
| Pod not ready | Readiness failing > 3 min | Critical |
| Redis down | `redis: "error"` on health > 1 min | Critical |

---

## How the pieces fit

Structured logging is the foundation. pino (`src/lib/observability/logger.ts`) gives every search a child logger keyed on `requestId` and `route`, with fixed event names across the API and orchestration layers. Promtail ships stdout to Loki; Grafana provides the Trip Search Logs dashboard for filtering by `requestId`, event type, and provider.

Prometheus scrapes `/api/metrics` for SLO tracking — search duration histograms, per-provider latency, quorum failure counters, circuit breaker gauges, and cache hit ratio. The `http_inflight_requests` gauge feeds the HPA custom metric in [kubernetes.md](./kubernetes.md).

OpenTelemetry instruments the span tree in the Tracing section — root `trip.search` with children for `llm.parse`, `cache.lookup`, each `provider.*`, normalize, rank, and response packaging. Auto-instrumentation on `fetch` and incoming HTTP means we can trace a slow search to a specific GDS without grepping logs.

Grafana alert rules cover the conditions in the Alerts table: p95 latency breach, quorum failure rate, breaker stuck open, provider timeout spikes, and Redis unreachable via the health endpoint.
