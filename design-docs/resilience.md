# Failure handling

How the service stays within latency bounds when upstreams are slow, down, or flaky.

**Code locations:** `src/lib/resilience/`, `src/lib/orchestration/trip-search-service.ts`, `src/lib/providers/run-provider-client.ts`.

---

## Philosophy

Trip search has a hard latency ceiling (~3s p95 on the sync route). The approach:

1. **Fail fast** per provider on the first attempt (2.5s cap).
2. **Isolate** failures — one provider dying doesn't cancel the others.
3. **Retry once** if quorum is at risk — only failed providers, shorter timeout.
4. **Let the client re-search** for longer outages; stale cache covers repeat queries.

There is no open-ended retry loop.

---

## Quorum (the most important rule)

Every search calls **three providers**: Sabre, Amadeus, HotelBeds.

**Rule:** at least **2 of 3** must return `status: "success"`, or the API throws `QuorumError` → HTTP 503.

This is a simple count. It does **not** require both flights and hotels — only that two providers responded OK.

| Outcome (final) | HTTP | `partialResults` | What the user gets |
|-----------------|------|------------------|-------------------|
| 3/3 | 200 | false | Flights + hotels |
| 2/3 | 200 | true | Whatever the two successful providers returned |
| 0–1/3 | 503 | n/a | Error message |

**Common scenarios**

| Who succeeded | Result |
|---------------|--------|
| Sabre + HotelBeds (Amadeus down) | 200 — flights + hotels, `partialResults: true` |
| Amadeus + HotelBeds (Sabre down) | 200 — flights + hotels, `partialResults: true` |
| Sabre + Amadeus (HotelBeds down) | 200 — **flights only**, no hotels, `partialResults: true` |
| HotelBeds only (both GDSs down) | 503 after retry |

HotelBeds is the only hotel source. If it's down, users still get flights when both GDSs succeed — but no hotel offers. Serving stale hotel cache on HotelBeds outage is listed as a future improvement in the README.

**When retry runs:** only when attempt 1 yields fewer than 2 successes. Providers that already succeeded are **not** called again.

---

## Timeouts

| Layer | Default | Env var | Applies to |
|-------|---------|---------|------------|
| Per-provider (attempt 1) | 2500ms | `PROVIDER_TIMEOUT_MS` | Initial parallel fan-out |
| Quorum retry (attempt 2) | 1000ms | `PROVIDER_RETRY_TIMEOUT_MS` | Failed providers only |
| Global (sync only) | 3000ms prod | `GLOBAL_TIMEOUT_MS` | Entire `searchTrip()` including retry |
| LLM parse | 12000ms | `LLM_PARSE_TIMEOUT_MS` | OpenAI call (`AbortController`) |
| Stream route | no global cap | — | Per-provider caps still apply on both attempts |

Provider I/O eats most of the budget. On the sync route, the 3s global timeout may return HTTP 504 before a quorum retry finishes. The stream route has no global cap — it relies on per-provider limits and streams partial results while waiting.

---

## Circuit breaker

One breaker per provider in `run-provider-client.ts`. Three states:

| State | What happens |
|-------|-------------|
| **Closed** | Normal — calls go through |
| **Open** (after 3 consecutive failures) | Fail immediately for 30s — no upstream call |
| **Half-open** | Single probe call; success → closed, failure → open again |

When open, callers get `"Circuit breaker is open"` internally → `ProviderStatus.status: "error"`. Breaker internals are not exposed to the client.

---

## Provider isolation

Each provider runs in its own `try/catch` inside `runProvider()`. Fan-out uses contained promises: one rejection never cancels siblings. The orchestrator waits for all three to settle (success, error, or timeout) before evaluating quorum.

---

## Retries

| Layer | Policy |
|-------|--------|
| GDS/HotelBeds | One quorum retry — when fewer than 2 of 3 succeed, retry **only failed providers once**. Disable with `PROVIDER_QUORUM_RETRY=false`. |
| LLM | Fallback chain, not retry: OpenAI → contextual modify → regex mock |
| Client | User can retry the whole search |
| Cache | Stale-while-revalidate refreshes in background — not a provider retry |

### Quorum retry flow

```
attempt 1 (parallel, PROVIDER_TIMEOUT_MS = 2.5s)
    │
    ├─ ≥2 successes → rank, return 200
    │
    └─ <2 successes
           │
           ├─ PROVIDER_QUORUM_RETRY=false → QuorumError (503)
           │
           └─ retry failed providers once (parallel, PROVIDER_RETRY_TIMEOUT_MS = 1s)
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
| Fails attempt 1, but quorum already met (2/3 OK) | 1 (not retried) |
| Fails attempt 1, quorum missed, retry enabled | 2 |
| Fails both attempts | 2 → contributes to 503 |

**Worked examples**

- Sabre + Amadeus fail transiently, HotelBeds OK (1/3) → retry Sabre + Amadeus → 3/3 if both recover.
- Origin `ZZZ` (deterministic flight GDS failure) → retry Sabre + Amadeus → still fail → 503.
- Sabre + HotelBeds OK, Amadeus down (2/3) → **no retry**; 200 with `partialResults: true`.

Sync `POST /api/trips/search` may return **504** if the retry exhausts `GLOBAL_TIMEOUT_MS` (3s). Stream has no global cap — retries complete under per-provider limits and emit extra SSE events.

Logs emit `provider_quorum_retry` with the list of retried providers; retry results reuse `provider_result` with `attempt: 2`.

### LLM fallback chain

```
query → OpenAI (if key present and MOCK_LLM=false)
      → on fail/timeout: applyTripModifications (if context)
      → else: regex mock parser
```

Sync route caps the first OpenAI attempt at `SYNC_LLM_PARSE_TIMEOUT_MS` (800ms default) so provider fan-out still fits the 3s global budget. Stream search uses the full `LLM_PARSE_TIMEOUT_MS` for free-form natural language.

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
