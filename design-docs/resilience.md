# Failure handling

Latency bounds, circuit breakers, quorum rules, and degradation paths when upstreams are slow, down, or flaky. Code: `src/lib/resilience/`, `src/lib/orchestration/trip-search-service.ts`, `src/lib/providers/run-provider-client.ts`.

---

## Philosophy

Trip search has a hard latency ceiling (~3s p95). Retrying a GDS call inside the same request usually makes things worse, not better. We fail fast per provider, aggregate what we got, and let the client or cache handle repeats.

---

## Timeouts

| Layer | Default | Env var | Notes |
|-------|---------|---------|-------|
| Per-provider | 2500ms | `PROVIDER_TIMEOUT_MS` | Each GDS/HotelBeds call |
| Global (sync only) | 3000ms prod | `GLOBAL_TIMEOUT_MS` | Wraps entire `searchTrip()` |
| LLM parse | 12000ms | `LLM_PARSE_TIMEOUT_MS` | `AbortController` on OpenAI |
| Stream route | none (global) | — | Per-provider caps still apply |

Provider I/O eats most of the budget. The 2.5s per-provider cap means the slowest upstream can't block the fan-out past ~2.5s. Sync adds a 3s safety net; stream relies on partial SSE updates instead.

---

## Circuit breaker

One breaker per provider in `run-provider-client.ts`. State machine in `circuit-breaker.ts`:

- **Closed** — normal
- **Open** after 3 consecutive failures — fail immediately for 30s, no upstream call
- **Half-open** — single probe; success closes, failure reopens

When open, callers get `"Circuit breaker is open"` → `ProviderStatus.status: "error"`. We don't expose breaker internals to the client.

---

## Quorum

Need ≥2 of 3 providers with `status: "success"`. Otherwise throw `QuorumError` → HTTP 503.

| Outcome | HTTP | `partialResults` |
|---------|------|------------------|
| 3/3 | 200 | false |
| 2/3 | 200 | true |
| 0–1/3 | 503 | n/a |

**Practical combos**

- Sabre + HotelBeds (Amadeus down): flights + hotels, OK
- Amadeus + HotelBeds (Sabre down): flights + hotels, OK
- Sabre + Amadeus (HotelBeds down): flights only, no hotels → fails quorum unless cache has hotel data

HotelBeds is our only hotel source. If it's down and we don't have a stale cache entry with hotels, we 503 even if both flight GDSs are fine. That's a product constraint, not a bug.

---

## Provider isolation

Each provider runs in its own `try/catch` inside `runProvider()`. Fan-out uses contained promises: one rejection never cancels siblings. The orchestrator always waits for all three to settle (success, error, or timeout) before quorum.

---

## Retries

| Layer | Policy |
|-------|--------|
| GDS/HotelBeds | No automatic retry |
| LLM | Fallback chain, not retry: OpenAI → contextual modify → regex mock |
| Client | User can retry the whole search |
| Cache | Stale-while-revalidate refreshes in background; not a provider retry |

### LLM fallback chain

```
query → OpenAI (if key present and MOCK_LLM=false)
      → on fail/timeout: applyTripModifications (if context)
      → else: regex mock parser
```

Sync `POST /api/trips/search` caps the first OpenAI attempt at `SYNC_LLM_PARSE_TIMEOUT_MS` (800ms default) so provider fan-out still fits the 3s global budget. Stream search uses the full `LLM_PARSE_TIMEOUT_MS` for free-form NL. On timeout or API error, sync falls back to regex parsing before returning 422.

OpenAI requests include `prompt_cache_key` (`OPENAI_PROMPT_CACHE_KEY`, default `ziarah-trip-parse`) so the static system prompt + JSON schema prefix is cached server-side. Logs emit `cachedPromptTokens` on `llm_parse_complete` for hit-rate monitoring.

Set `MOCK_LLM=true` or omit `OPENAI_API_KEY` to skip OpenAI entirely.

---

## Cache as degradation

| Status | User sees | Provider calls |
|--------|-----------|----------------|
| fresh | Instant cached result | 0 |
| stale | Instant cached result | 0 upfront; background refresh under `trip:lock:*` |
| miss | Full search | 3 parallel |

Concurrent stale refreshes dedupe via Redis `SET NX EX` locks — waiters poll for a fresh entry instead of fanning out again.

Repeat queries with identical normalized params can return usable data even when live providers are struggling.

---

## Mock chaos triggers

For CI and local testing without live GDS spend:

| Trigger | Effect |
|---------|--------|
| Origin `ZZZ` (or city `fail` → resolves to `ZZZ`) | Sabre + Amadeus fail |
| Origin `ERR` | Sabre + Amadeus validation error |
| `destinationCode` `FAIL` | HotelBeds fail |
| `destinationCode` `ERR` | HotelBeds validation error |
| `MOCK_FAILURE_RATE` (0–1) | Random mock failures |
| `MOCK_LATENCY_MS_MIN/MAX` | Artificial 200–800ms delay |

---

## What users see vs what we log

`src/lib/user-messages.ts` maps internal errors to generic copy. Stack traces, provider response bodies, and breaker state stay server-side, keyed by `requestId`.

| Internal | Client message |
|----------|----------------|
| `QuorumError` | "Search providers are temporarily unavailable." |
| Global timeout | "Your search took too long. Please try again." |
| Zod failure | "Please check your search and try again." |
