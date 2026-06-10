# Architecture

Module layout and data flow for the trip search service. Expands on [system-design.md](./system-design.md).

---

## Context

```
Traveler ──query──► Ziarah Trip Search (this repo) ──► OpenAI (parse)
                                                 ──► Sabre, Amadeus (flights)
                                                 ──► HotelBeds (hotels)
Traveler ◄─offers── Ziarah Trip Search (SSE stream or sync JSON)
```

One deployable: a Next.js standalone image serving both the landing/chat UI and API routes. No separate BFF (Backend-for-Frontend) service.

---

## Data flow

1. **Traveler** submits a natural-language query in `app/chat/`.
2. **API route** validates the body and calls `searchTripStream()` (UI) or `searchTrip()` (tests/simple clients).
3. **Orchestrator** (`trip-search-service.ts`) runs: parse → cache check → parallel provider fan-out → quorum retry (if needed) → normalize → rank → quorum check.
4. **API route** returns ranked offers — SSE events on the stream path, one JSON body on sync.
5. **Chat UI** renders offers as they arrive. `GET /api/trips/{id}` can reload a past result from Redis.

---

## Code layout

```
src/
  app/api/             HTTP handlers (search, stream, health, trips/{id})
  app/chat/            Chat workspace UI
  lib/orchestration/   trip-search-service.ts — main pipeline
  lib/llm/             parse-trip-query.ts — OpenAI + regex fallback
  lib/providers/       sabre, amadeus, hotelbeds + run-provider-client.ts
  lib/normalization/   per-provider → Unified*Offer
  lib/storage/         redis.ts, trip-query-cache, trip-results
  lib/observability/   pino logger, Prometheus metrics, OpenTelemetry tracing
  lib/resilience/      with-timeout, circuit-breaker
  lib/types/           trip.ts — shared types

tests/
  unit/                Vitest — lib, API routes, mocks (mirrors src layout)
  components/          UI unit tests

observability/         Loki, Promtail, Prometheus, Grafana provisioning (Docker Compose)
load/                  k6 scripts — SLO and per-pod capacity validation
```

Modules communicate through typed function calls. Shared state lives in **Redis** only. Everything else is request-scoped.

### Orchestrator entry points

| Function | Called by |
|----------|-----------|
| `searchTrip()` | `POST /api/trips/search` |
| `searchTripStream()` | `POST /api/trips/search/stream` |

### Provider entry points

| Function | Provider |
|----------|----------|
| `searchSabreFlights()` | Sabre BFM |
| `searchAmadeusFlights()` | Amadeus flight offers |
| `searchHotelBedsHotels()` | HotelBeds availability |

All three go through `runProviderClient()`, which applies the circuit breaker and timeout.

---

## Sync vs stream

Both paths share the same core pipeline. The difference is **how results are delivered** and **whether a global timeout applies**.

| | Sync (`searchTrip`) | Stream (`searchTripStream`) |
|--|---------------------|----------------------------|
| Response | One JSON body at the end | SSE events as work completes |
| Global timeout | Yes — 3s (`GLOBAL_TIMEOUT_MS`) | No |
| Per-provider timeout | Yes — 2.5s attempt 1, 1s attempt 2 | Same |
| Partial results | No — client waits for everything | Yes — `offers_update` events while waiting |
| Best for | Tests, curl, simple integrations | Chat UI (product) |

**Stream detail:** providers run in parallel. Whichever finishes first emits an SSE `provider` + `offers_update` event immediately. If quorum is missed after all three settle, the orchestrator emits `"Retrying unavailable providers..."`, re-queries failed providers once, and streams additional events.

---

## Caching

Four storage layers, each with a different job:

| Layer | Key | TTL | Where |
|-------|-----|-----|-------|
| Query cache | `trip:cache:{sha256}` | 5 min logical; 15 min Redis PX | Redis |
| Result store | `trip:result:{requestId}` | 1 hour | Redis |
| Refresh lock | `trip:lock:{sha256}` | 30s (`SET NX EX`) | Redis |
| Client | `requestId` in `sessionStorage` | Browser session | `ziarah-trip-results` |

`REDIS_URL` is required — local dev, Docker Compose, and K8s all point at Redis.

### Cache statuses (`meta.cache.status`)

| Status | Meaning | Provider calls |
|--------|---------|----------------|
| `fresh` | Cached data is current | 0 |
| `stale` | Cached data returned immediately; background refresh started | 0 upfront |
| `miss` | No usable cache | 3 parallel |

**Stale-while-revalidate (SWR):** when a cache entry is past its logical TTL but still in Redis, we return it immediately and refresh in the background. Concurrent refreshes dedupe via `trip:lock:*` — only one pod refreshes; others wait up to 10s for the fresh entry instead of fanning out again.

`GET /api/trips/{id}` reads the result store. Useful for deep links and reloading a past search.

---

## Service boundary

This ships as a **modular monolith** — one Next.js image, clear module boundaries under `src/lib/`.

| Concern | Why one deployable |
|---------|-------------------|
| Latency | 3s budget; internal RPC adds 20–50ms per hop for no gain |
| Scale | I/O-bound; horizontal pod scaling, not service splits |
| Ops | One Dockerfile, one HPA, one on-call runbook |

**Future extraction boundaries** (defined, not built):

- **Provider gateway** — when credential rotation and per-GDS rate limits outgrow `src/lib/providers/`
- **LLM service** — self-hosted models on GPU nodes
- **Booking service** — ticketing and PCI scope; outside search

---

## Tech choices

| Choice | Reason |
|--------|--------|
| Next.js 16 App Router | API + UI in one repo; `output: "standalone"` for Docker |
| Zod | Validate LLM output and API bodies at runtime |
| Vitest | 635+ tests under `tests/`; 80% coverage thresholds on `src/` |
| Redis 7 | Shared query cache, result store, refresh locks — no relational DB |

Provider auth: OAuth2 for Sabre/Amadeus, SHA256 signature for HotelBeds.
