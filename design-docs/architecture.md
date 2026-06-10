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

One deployable: Next.js standalone image serving both the landing/chat UI and API routes. No separate BFF.

---

## Data flow

1. **Traveler** submits a natural-language query in `app/chat/`.
2. **API route** validates the body and calls `searchTripStream()` (product UI) or `searchTrip()` (sync clients/tests).
3. **Orchestrator** parses → cache check → parallel provider fan-out → quorum retry (if needed) → normalize → rank → quorum check.
4. **API route** returns ranked offers: SSE events (`provider`, `offers_update`, `complete`) on the stream path, or one JSON body on sync.
5. **Chat UI** renders offers to the traveler as they arrive; `GET /api/trips/{id}` can hydrate history from the result store.

---

## Layout

```
src/
  app/api/             HTTP handlers
  app/chat/            Chat workspace UI
  lib/orchestration/   trip-search-service.ts — main pipeline
  lib/llm/             parse-trip-query.ts
  lib/providers/       sabre, amadeus, hotelbeds + run-provider-client.ts
  lib/normalization/   per-provider → Unified*Offer
  lib/storage/         redis.ts, trip-query-cache, trip-results
  lib/observability/   pino logger + API route constants
  lib/resilience/      with-timeout, circuit-breaker
  lib/types/           trip.ts — shared types

tests/
  unit/                Vitest — lib, API routes, mocks (mirrors src layout)
  components/          UI unit tests

observability/         Loki, Promtail, Grafana provisioning (Docker Compose)
load/                  k6 scripts — SLO and per-pod capacity validation
```

Modules talk through typed functions. Shared state lives in **Redis** (query cache, result store, refresh locks). Everything else is request-scoped.

**Entry points the orchestrator exposes**

| Function | Called by |
|----------|-----------|
| `searchTrip()` | `POST /api/trips/search` |
| `searchTripStream()` | `POST /api/trips/search/stream` |

**Provider entry points**

| Function | Provider |
|----------|----------|
| `searchSabreFlights()` | Sabre BFM |
| `searchAmadeusFlights()` | Amadeus flight offers |
| `searchHotelBedsHotels()` | HotelBeds availability |

All three go through `runProviderClient()`, which applies the circuit breaker and timeout.

---

## Sync vs stream

Both paths share parse → cache → fan-out → quorum retry (if needed) → normalize → rank → quorum check.

**Sync** uses `Promise.all` on providers, optionally retries failed providers once when quorum is missed, then returns one JSON body. A global timeout wraps the entire pipeline (parse + fan-out + retry).

**Stream** uses a race loop: whichever provider finishes first emits SSE immediately. Partial offers reach the traveler through the chat UI while the slowest GDS is still working. If quorum is missed after all three settle, the orchestrator emits `"Retrying unavailable providers..."`, re-queries failed providers once, and streams additional `provider` + `offers_update` events. No global timeout on the stream route; per-provider caps apply on both attempts.

---

## Caching

Three layers, different jobs:

| Layer | Key | TTL | Where |
|-------|-----|-----|-------|
| Query cache | `trip:cache:{sha256}` | 5 min logical; 15 min Redis PX (SWR headroom) | Redis |
| Result store | `trip:result:{requestId}` | 1 hour | Redis |
| Refresh lock | `trip:lock:{sha256}` | 30s (`SET NX EX`) | Redis |
| Client | `requestId` in `sessionStorage` | Browser session | `ziarah-trip-results` |

`REDIS_URL` is required — local dev, Docker Compose, and K8s all point at Redis.

**Cache statuses** (in `meta.cache.status`)

- `fresh` — return cached, no provider calls
- `stale` — return cached immediately; background refresh under a distributed lock
- `miss` — full fan-out

Concurrent stale refreshes dedupe via `trip:lock:*` — the waiter polls for a fresh entry (up to 10s) instead of fanning out again. Stale-while-revalidate keeps repeat searches fast even when a GDS is struggling.

`GET /api/trips/{id}` reads the result store. Useful for deep links and chat history hydration.

---

## Service boundary

This ships as a modular monolith — one Next.js image, clear module boundaries under `src/lib/`. The case for staying together:

| Concern | Why one deployable |
|---------|-------------------|
| Latency | 3s budget; internal RPC adds 20–50ms per hop for no gain |
| Scale | I/O-bound; horizontal pod scaling, not service splits |
| Ops | One Dockerfile, one HPA, one on-call runbook |

Extraction boundaries are defined but not exercised:

- **Provider gateway** — when credential rotation and per-GDS rate limits outgrow `src/lib/providers/`
- **LLM service** — self-hosted models on GPU nodes, separate from search pods
- **Booking service** — ticketing and PCI scope; outside search

---

## Tech choices

| Choice | Reason |
|--------|--------|
| Next.js 16 App Router | API + UI in one repo; `output: "standalone"` for Docker |
| Zod | Validate LLM output and API bodies at runtime |
| Vitest | 635+ tests under `tests/`; 80% coverage thresholds on `src/` |
| Redis 7 | Shared query cache, result store, refresh locks — no relational DB |

Provider auth is whatever they require: OAuth2 for Sabre/Amadeus, SHA256 signature for HotelBeds.
