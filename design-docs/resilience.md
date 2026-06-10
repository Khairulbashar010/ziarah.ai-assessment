# Failure handling

Latency bounds, circuit breakers, quorum rules, and degradation paths when upstreams are slow, down, or flaky. Code: `src/lib/resilience/`, `src/lib/orchestration/trip-search-service.ts`, `src/lib/providers/run-provider-client.ts`.

---

## Philosophy

Trip search has a hard latency ceiling (~3s p95). We fail fast per provider on the first attempt, aggregate what we got, and only retry when quorum is at risk. Retries are **bounded**: one extra round, failed providers only, shorter timeout — not an open-ended retry loop. Client re-search and stale cache cover longer outages.

---

## Timeouts

| Layer | Default | Env var | Notes |
|-------|---------|---------|-------|
| Per-provider (attempt 1) | 2500ms | `PROVIDER_TIMEOUT_MS` | Initial parallel fan-out |
| Quorum retry (attempt 2) | 1000ms | `PROVIDER_RETRY_TIMEOUT_MS` | Failed providers only; skipped when quorum already met |
| Global (sync only) | 3000ms prod | `GLOBAL_TIMEOUT_MS` | Wraps entire `searchTrip()` including one retry round |
| LLM parse | 12000ms | `LLM_PARSE_TIMEOUT_MS` | `AbortController` on OpenAI |
| Stream route | none (global) | — | Per-provider caps still apply on both attempts |

Provider I/O eats most of the budget. The 2.5s per-provider cap means the slowest upstream can't block the initial fan-out past ~2.5s. A quorum retry adds up to `PROVIDER_RETRY_TIMEOUT_MS` per failed provider (parallel). Sync adds a 3s safety net that may return 504 before retry completes; stream relies on partial SSE updates and has no global cap.

---

## Circuit breaker

One breaker per provider in `run-provider-client.ts`. State machine in `circuit-breaker.ts`:

- **Closed** — normal
- **Open** after 3 consecutive failures — fail immediately for 30s, no upstream call
- **Half-open** — single probe; success closes, failure reopens

When open, callers get `"Circuit breaker is open"` → `ProviderStatus.status: "error"`. We don't expose breaker internals to the client.

---

## Quorum

Need ≥2 of 3 providers with `status: "success"` **after** the initial fan-out and any quorum retry. Otherwise throw `QuorumError` → HTTP 503.

| Outcome (final) | HTTP | `partialResults` |
|-----------------|------|------------------|
| 3/3 | 200 | false |
| 2/3 | 200 | true |
| 0–1/3 | 503 | n/a |

**When retry runs:** only when attempt 1 yields `<2` successes. Providers that succeeded on attempt 1 are not called again.

**Practical combos**

- Sabre + HotelBeds (Amadeus down): flights + hotels, OK
- Amadeus + HotelBeds (Sabre down): flights + hotels, OK
- Sabre + Amadeus (HotelBeds down): flights only, no hotels → fails quorum unless cache has hotel data

HotelBeds is our only hotel source. If it's down and we don't have a stale cache entry with hotels, we 503 even if both flight GDSs are fine. That's a product constraint, not a bug.

---

## Provider isolation

Each provider runs in its own `try/catch` inside `runProvider()`. Fan-out uses contained promises: one rejection never cancels siblings. The orchestrator always waits for all three to settle (success, error, or timeout) before evaluating quorum and deciding whether to retry.

---

## Retries

| Layer | Policy |
|-------|--------|
| GDS/HotelBeds | One quorum retry — when fewer than 2 of 3 succeed, retry **only failed providers once** with `PROVIDER_RETRY_TIMEOUT_MS` (default 1000ms). Disable with `PROVIDER_QUORUM_RETRY=false`. |
| LLM | Fallback chain, not retry: OpenAI → contextual modify → regex mock |
| Client | User can retry the whole search |
| Cache | Stale-while-revalidate refreshes in background; not a provider retry |

### Quorum retry

After the initial parallel fan-out, if quorum is not met (`<2` successes), the orchestrator retries each failed provider **once** with a shorter per-call timeout. Successful providers from the first attempt are kept; only failures are re-queried. There is **no third attempt** — one retry round per request, then success or `QuorumError`.

```
attempt 1 (parallel, PROVIDER_TIMEOUT_MS)
    │
    ├─ ≥2 successes → rank, return 200
    │
    └─ <2 successes
           │
           ├─ PROVIDER_QUORUM_RETRY=false → QuorumError (503)
           │
           └─ retry failed providers once (parallel, PROVIDER_RETRY_TIMEOUT_MS)
                  │
                  ├─ ≥2 successes → rank, return 200
                  └─ still <2 → QuorumError (503)
```

| Setting | Default | Notes |
|---------|---------|-------|
| `PROVIDER_QUORUM_RETRY` | `true` | Set `false` to fail fast on first quorum miss |
| `PROVIDER_RETRY_TIMEOUT_MS` | `1000` | Per-provider cap on attempt 2 |

**Max attempts per provider**

| Scenario | Attempts |
|----------|----------|
| Succeeds on attempt 1 | 1 |
| Fails attempt 1, quorum already met (2/3 OK) | 1 (not retried) |
| Fails attempt 1, quorum missed, retry enabled | 2 |
| Fails both attempts | 2 → contributes to 503 |

**Examples**

- Sabre + Amadeus fail transiently, HotelBeds OK (1/3) → retry Sabre + Amadeus → 3/3 if both recover.
- Origin `ZZZ` (deterministic flight GDS failure) → retry Sabre + Amadeus → still fail → 503.
- Sabre + HotelBeds OK, Amadeus down (2/3) → no retry; 200 with `partialResults: true`.

Sync `POST /api/trips/search` may return **504** if the retry exhausts `GLOBAL_TIMEOUT_MS` (3s). Stream has no global cap — retries complete under per-provider limits and emit extra SSE `status` / `provider` / `offers_update` events.

Logs emit `provider_quorum_retry` with the list of retried providers; retry results reuse `provider_result` with `attempt: 2`.

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
