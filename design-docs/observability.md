# Observability

What we log today, what prod needs, and what I'd wire up before calling this production-ready.

---

## Current state

| Signal | Status |
|--------|--------|
| Error logs | `console.error` on quorum/search failures with structured objects |
| Health | `GET /api/health` — service name, timestamp, mock flags |
| Correlation | `X-Request-Id` on SSE responses (generate at ingress if missing) |
| Duration | `X-Duration-Ms` on SSE responses |

That's enough for local dev and the assessment demo. Not enough for on-call.

---

## Target stack

```
App pod → stdout (JSON logs) → Fluent Bit → Loki or CloudWatch
         → OTEL SDK → Collector → Tempo or X-Ray
         → Prometheus client → scrape → Grafana
```

Traces, metrics, and logs all keyed on `requestId`. W3C `traceparent` propagation is a follow-up once OTEL is in.

---

## Tracing

**Span tree I'd implement:**

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

**Attributes worth setting**

| Span | Tags |
|------|------|
| `trip.search` | `requestId`, `route`, `cache.status`, `quorum.met`, `durationMs` |
| `llm.parse` | `model`, `mock`, `parse.source` (openai / regex / modify) |
| `provider.*` | `provider.name`, `status`, `offerCount`, `durationMs`, `circuitBreaker.state` |

Implementation: `@opentelemetry/sdk-node` with auto-instrumentation for `fetch` and incoming HTTP.

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
| `http_inflight_requests` | — | HPA custom metric if we add it |

Expose on `/api/metrics` or a sidecar. Grafana dashboards: search SLO panel + per-provider health panel.

---

## Logging

Move from `console.error` to pino (or equivalent) with a fixed schema:

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
- Parse done: `parse.source`, duration
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

---

## Implementation order

1. Structured logger (pino) replacing ad-hoc `console.error`
2. Prometheus metrics on `/api/metrics`
3. OTEL traces with the span tree above
4. Grafana dashboards + alert rules

Steps 1–2 are a day or two of work. Step 3 depends on whether we already have an OTEL collector in the cluster.
