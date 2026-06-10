# Architecture

Expands on [system-design.md](./system-design.md). Focus here is how code is organized and how data moves through it.

---

## Context

```
Traveler → Ziarah Trip Search (this repo) → OpenAI (parse)
                                        → Sabre, Amadeus (flights)
                                        → HotelBeds (hotels)
```

One deployable: Next.js standalone image serving both the landing/chat UI and API routes. No separate BFF.

---

## Layout

```
src/
  app/api/          HTTP handlers
  app/chat/         Chat workspace UI
  lib/orchestration/   trip-search-service.ts — main pipeline
  lib/llm/             parse-trip-query.ts
  lib/providers/       sabre, amadeus, hotelbeds + run-provider-client.ts
  lib/normalization/   per-provider → Unified*Offer
  lib/storage/         trip-query-cache, trip-results
  lib/resilience/      with-timeout, circuit-breaker
  lib/types/           trip.ts — shared types
```

Modules talk through typed functions. The only shared mutable state is the storage layer (in-memory today, Redis later). Everything else is request-scoped.

**Entry points the orchestrator exposes**

| Function | Called by |
|----------|-----------|
| `searchTrip()` | `POST /api/trips/search` |
| `streamTripSearch()` | `POST /api/trips/search/stream` |

**Provider entry points**

| Function | Provider |
|----------|----------|
| `searchSabreFlights()` | Sabre BFM |
| `searchAmadeusFlights()` | Amadeus flight offers |
| `searchHotelBedsHotels()` | HotelBeds availability |

All three go through `runProviderClient()`, which applies the circuit breaker and timeout.

---

## Sync vs stream

Both paths share parse → cache → fan-out → normalize → rank → quorum.

**Sync** uses `Promise.all` on providers, then returns one JSON body. A global timeout wraps the whole thing.

**Stream** uses a race loop: whichever provider finishes first emits SSE immediately. The UI gets partial offers while the slowest GDS is still working. No global timeout on the stream route; per-provider caps still apply.

---

## Caching

Three layers, different jobs:

| Layer | Key | TTL | Where |
|-------|-----|-----|-------|
| Query cache | SHA-256 of normalized `TripSearchParams` | 5 min fixed window | Server (per-pod → Redis) |
| Result store | `requestId` | Until restart (→ 1h in Redis) | Server |
| Client | `requestId` in `sessionStorage` | Browser session | `ziarah-trip-results` |

**Cache statuses**

- `fresh` — return cached, no provider calls
- `stale` — return cached, kick off background refresh (stale-while-revalidate)
- `miss` — full fan-out
- `refreshing` — another request is already refreshing; wait on the same lock

Stale-while-revalidate is intentional: repeat searches with the same params stay fast even when a GDS is having a bad day.

`GET /api/trips/{id}` reads the result store. Useful for deep links and chat history hydration.

---

## Why not microservices (yet)

| Concern | Reality for this service |
|---------|--------------------------|
| Latency | 3s budget; internal RPC adds 20–50ms per hop for no gain |
| Team | Small; one repo is faster to ship and debug |
| Scale | I/O-bound; add pods, not services |
| Ops | One Dockerfile, one HPA, one on-call runbook |

**First thing I'd extract:** a provider gateway if we go past 3 GDS integrations or need per-provider rate limits and credential rotation without touching orchestration code.

**Second:** LLM parsing, if we move off hosted OpenAI to self-hosted models.

**Third:** booking/ticketing — different SLA, PCI, long transactions. Not part of search.

---

## Tech choices

| Choice | Reason |
|--------|--------|
| Next.js 16 App Router | API + UI in one repo; `output: "standalone"` for Docker |
| Zod | Validate LLM output and API bodies at runtime |
| Vitest | 85+ tests on orchestration, providers, UI |
| No DB | Search results are ephemeral; cache is the only persistence |

Provider auth is whatever they require: OAuth2 for Sabre/Amadeus, SHA256 signature for HotelBeds.
