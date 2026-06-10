# Ziarah Trip Search

**Author:** Engineering  
**Last updated:** June 2026  
**Stack:** Next.js 16 (App Router), TypeScript, Redis 7, standalone Docker image

---

## What this is

Assessment deliverable for [Ziarah.ai](https://ziarah.ai): a trip search service that takes a natural-language query, parses it into structured params, fans out to Sabre, Amadeus, and HotelBeds in parallel, normalizes the responses, and returns ranked flights and hotels the chat UI can render.

The working code lives here. The architecture, API contract, resilience model, and K8s notes are in [`design-docs/`](design-docs/) — start with [system-design.md](design-docs/system-design.md).

---

## Running it

### Fastest path: Docker Compose

Mock mode by default. No provider keys, no OpenAI key, Redis included:

```bash
docker compose up --build
```

App on [http://localhost:3000](http://localhost:3000). Health: `GET /api/health` — expect `redis: "ok"`.


### Local development

Node 20+. Redis is required — we use it for query cache, `requestId` → result lookup, and distributed refresh locks. Not optional in prod; same for local if you want realistic cache behavior.

```bash
npm install
cp .env.example .env
```

Redis (if you don't already have one):

```bash
docker run -d --name ziarah-redis -p 6379:6379 redis:7-alpine
```

```bash
npm run dev          # development
npm run build && npm run start   # production binary locally
```

`.env` defaults to `MOCK_PROVIDERS=true` and `MOCK_LLM=true`. Copy from `.env.example`; all tunables are documented there.

### Verify it works

**UI.** Open the app and search:

> family of 4 from Dubai to London, December 20-27, budget $3000

**Sync API** (good for curl and tests):

```bash
curl -X POST http://localhost:3000/api/trips/search \
  -H "Content-Type: application/json" \
  -d '{"query":"family of 4 from Dubai to London, December 20-27, budget $3000"}'
```

**Stream API** (what the chat UI actually uses): `POST /api/trips/search/stream` — SSE events as each provider completes. Same pipeline; see [api-contract.md](design-docs/api-contract.md).

**Tests:**

```bash
npm test
```

### Operating modes

| Mode | Config | When |
|------|--------|------|
| Mock everything | `MOCK_PROVIDERS=true`, `MOCK_LLM=true` | CI, Docker demo, local without credentials |
| Live flights + hotels | `MOCK_PROVIDERS=false`, Sabre + HotelBeds keys in `.env` | Sandbox integration testing |
| Live LLM | `MOCK_LLM=false`, `OPENAI_API_KEY` set | Free-form queries the regex parser won't catch |

**What's actually live today:** Sabre BFM and HotelBeds availability can hit real sandboxes. Amadeus is mock-only — enterprise onboarding is slow and Sabre already proves the GDS integration path. Flip `MOCK_AMADEUS=false` when creds land; the adapter slot is there.

### Chaos scenarios worth trying

| Input / env | What happens |
|-------------|--------------|
| Happy-path Dubai → London query | 3/3 providers, flights + hotels, HTTP 200 |
| Origin `fail` (mock chaos) | Flight GDSs fail, quorum breaks → HTTP 503 |
| `MOCK_FAILURE_RATE=0.3` | Random mock failures; 200 when ≥2 providers succeed |
| `MOCK_LLM=true` (default) | Regex parser — fast, deterministic, fewer phrasings |

Full mock triggers: [resilience.md](design-docs/resilience.md#mock-chaos-triggers).

---

## Trade-offs

These are the calls I'd defend in a design review.

**Modular monolith over microservices.** The bottleneck is GDS and HotelBeds latency, not CPU. Splitting parse, fan-out, and normalize into separate services adds network hops inside a 3s p95 budget. One Next.js image, clear module boundaries under `src/lib/`, horizontal scale via pod count. I'd extract a provider gateway only when credential management and rate limiting outgrow a single module.

**2-of-3 quorum.** Two flight GDSs give us redundancy on the air side. Hotels come from HotelBeds only — if it's down and we don't have a stale cache entry with hotel inventory, we 503 even when both Sabre and Amadeus are fine. That's intentional: returning flights with no hotels is a worse UX than a clear error. Product constraint, not an oversight.

**No retries on provider calls.** A retry inside the same request usually blows the 3s ceiling. Per-provider timeout (2.5s), circuit breaker (3 failures → 30s open), and client/cache retry are the recovery story. Predictable failure beats heroic recovery.

**SSE-first, sync second.** The chat UI streams `provider` and `offers_update` events so users see results land instead of waiting on the slowest GDS. Sync route exists for tests and simple clients; it wraps the same pipeline with a global timeout.

**Mock LLM by default.** Regex + deterministic parser keeps CI and Docker reproducible without OpenAI spend. Production path is OpenAI structured output with regex fallback — set `MOCK_LLM=false` when you have a key.

**Provider-native mocks.** Mock payloads mirror real Sabre/Amadeus/HotelBeds response shapes so normalization tests catch field-mapping bugs without sandbox quota. Trade-off: larger seed files, optional Mockaroo regeneration.

**Redis from day one.** In-memory `Map` works for single-pod dev, but multi-replica prod needs shared query cache, result store, and refresh locks. Redis is a hard dependency in Compose and the K8s manifests — I'd rather wire it now than discover cache incoherence at scale.

**Trip-level budget.** Users say "$3000 for the trip," not "$1500 flights, $1500 hotels." We filter after ranking across both verticals. Can't express per-vertical caps in one number — acceptable for v1.

---

## With more time

Ordered by what I'd tackle first if this were going to production.

**1. Finish the integration surface**

- Live Amadeus OAuth + flight search (parity with Sabre adapter)
- Token refresh and credential rotation for all providers
- Booking path: HotelBeds CheckRate, Sabre revalidate — search-only is done; ticketing is not

**2. Observability before scale**

- OpenTelemetry: root span `trip.search`, children for `llm.parse`, each `provider.*`, `normalize`, `rank` — correlate on `requestId`
- Prometheus: `trip_search_duration_ms`, `provider_duration_ms`, quorum failure rate, breaker state, cache hit ratio
- Structured logging (pino); no query text or secrets in log lines
- Load test to validate 10k concurrent / 3s p95 — we have the math in [kubernetes.md](design-docs/kubernetes.md); we don't have the evidence yet

**3. Resilience gaps**

- Stale hotel cache fallback when HotelBeds is down — serve last-known inventory with a freshness banner instead of hard 503
- Configurable quorum (e.g. flights-only with explicit user opt-in)
- Rate limiting and API key auth on public endpoints

**4. Product expansion**

- Activity and transfer providers
- Redis-backed chat session history — multi-turn context is client-held today
- Provider health dashboard for ops

**5. Test depth**

- Contract tests against provider sandbox schemas
- E2E for the SSE stream and chat workspace
- Split services only if the monolith actually hurts — not preemptively

---

## Further reading

| Topic | Doc |
|-------|-----|
| System design (architecture, API, deployment) | [system-design.md](design-docs/system-design.md) |
| Module layout, cache layers | [architecture.md](design-docs/architecture.md) |
| Request/response types, SSE events | [api-contract.md](design-docs/api-contract.md) |
| Timeouts, quorum, breakers | [resilience.md](design-docs/resilience.md) |
| Metrics, tracing plan | [observability.md](design-docs/observability.md) |
| K8s manifests, HPA, Redis | [kubernetes.md](design-docs/kubernetes.md) |
