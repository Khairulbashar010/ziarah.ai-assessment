# Ziarah Trip Search

Assessment deliverable for [Ziarah.ai](https://ziarah.ai): natural-language trip search that fans out to Sabre, Amadeus, and HotelBeds in parallel, normalizes results, and returns ranked flights and hotels for the chat UI.

Architecture, API contract, resilience model, and K8s notes: [`design-docs/`](design-docs/) — start with [system-design.md](design-docs/system-design.md).

---

## How to run it

### Docker Compose (fastest path)

Mock mode by default — no provider keys, no OpenAI key, Redis included:

```bash
docker compose up --build
```

- App: [http://localhost:3000](http://localhost:3000)
- Health: `GET /api/health` — expect `redis: "ok"`
- Grafana: [http://localhost:3001](http://localhost:3001) — `admin` / `admin` (override via `GRAFANA_ADMIN_*` in `.env`)
- Dashboard: **Trip Search → Trip Search Logs** — correlate via `X-Request-Id` from API responses

### Local development

Node 20+. Redis is required for query cache, result lookup, and distributed refresh locks.

```bash
npm install
cp .env.example .env
```

Redis (if you don't already have one):

```bash
docker run -d --name ziarah-redis -p 6379:6379 redis:7-alpine
```

```bash
npm run dev                        # development
npm run build && npm run start     # production binary locally
```

`.env` defaults to `MOCK_PROVIDERS=true` and `MOCK_LLM=true`. All tunables are documented in `.env.example`.

### Verify it works

**UI** — open the app and search:

> family of 4 from Dubai to London, December 20-27, budget $3000

**Sync API:**

```bash
curl -X POST http://localhost:3000/api/trips/search \
  -H "Content-Type: application/json" \
  -d '{"query":"family of 4 from Dubai to London, December 20-27, budget $3000"}'
```

**Stream API** (what the chat UI uses): `POST /api/trips/search/stream` — SSE events as each provider completes. See [api-contract.md](design-docs/api-contract.md).

**Tests:**

```bash
npm test
```

**Load tests** ([k6](https://k6.io/) — install locally, or use Docker against the Compose stack):

```bash
npm run loadtest:smoke        # quick sanity check
npm run loadtest:sync         # p95 vs 3s SLO, ramp to 50 VUs
npm run loadtest:capacity     # step-ramp to ~100 VUs

# Docker — docker compose up first
npm run loadtest:docker:smoke
npm run loadtest:docker:sync
npm run loadtest:docker:capacity
```

See [load/README.md](load/README.md) for tuning and K8s-scale runs.

### Operating modes

| Mode | Config | When |
|------|--------|------|
| Mock everything | `MOCK_PROVIDERS=true`, `MOCK_LLM=true` | CI, Docker demo, local without credentials |
| Live flights + hotels | `MOCK_PROVIDERS=false`, Sabre + HotelBeds keys in `.env` | Sandbox integration testing |
| Live LLM | `MOCK_LLM=false`, `OPENAI_API_KEY` set | Free-form queries the regex parser won't catch |

**What's live today:** Sabre BFM and HotelBeds availability can hit real sandboxes. Amadeus is mock-only — enterprise onboarding is slow and Sabre already proves the GDS integration path. Flip `MOCK_AMADEUS=false` when creds land; the adapter slot is there.

---

## Trade-offs you made

**Modular monolith over microservices.** The bottleneck is GDS and HotelBeds latency, not CPU. Splitting parse, fan-out, and normalize into separate services adds network hops inside a 3s p95 budget. One Next.js image, clear module boundaries under `src/lib/`, horizontal scale via pod count. I'd extract a provider gateway only when credential management and rate limiting outgrow a single module.

**2-of-3 quorum.** Two flight GDSs give us redundancy on the air side. Hotels come from HotelBeds only — if it's down and we don't have a stale cache entry with hotel inventory, we 503 even when both Sabre and Amadeus are fine. That's intentional: returning flights with no hotels is a worse UX than a clear error.

**No retries on provider calls.** A retry inside the same request usually blows the 3s ceiling. Per-provider timeout (2.5s), circuit breaker (3 failures → 30s open), and client/cache retry are the recovery story. Predictable failure beats heroic recovery.

**SSE-first, sync second.** The chat UI streams `provider` and `offers_update` events so users see results land instead of waiting on the slowest GDS. Sync route exists for tests and simple clients; it wraps the same pipeline with a global timeout.

**Mock LLM by default.** Regex + deterministic parser keeps CI and Docker reproducible without OpenAI spend. Production path is OpenAI structured output with regex fallback — set `MOCK_LLM=false` when you have a key.

**Provider-native mocks.** Mock payloads mirror real Sabre/Amadeus/HotelBeds response shapes so normalization tests catch field-mapping bugs without sandbox quota. Trade-off: larger seed files, optional Mockaroo regeneration.

**Redis from day one.** In-memory `Map` works for single-pod dev, but multi-replica prod needs shared query cache, result store, and refresh locks. Redis is a hard dependency in Compose and the K8s manifests.

**Trip-level budget.** Users say "$3000 for the trip," not "$1500 flights, $1500 hotels." We filter after ranking across both verticals. Can't express per-vertical caps in one number — acceptable for v1.

---

## What you'd do differently with more time

Ordered by what I'd tackle first if this were going to production.

**1. Finish the integration surface**

- Live Amadeus OAuth + flight search (parity with Sabre adapter)
- Token refresh and credential rotation for all providers
- Booking path: HotelBeds CheckRate, Sabre revalidate — search-only is done; ticketing is not

**2. Observability before scale**

- OpenTelemetry: root span `trip.search`, children for `llm.parse`, each `provider.*`, `normalize`, `rank` — correlate on `requestId`
- Prometheus: `trip_search_duration_ms`, `provider_duration_ms`, quorum failure rate, breaker state, cache hit ratio
- Load test to validate 10k concurrent / 3s p95 — math in [kubernetes.md](design-docs/kubernetes.md); evidence still needed

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
| System design | [system-design.md](design-docs/system-design.md) |
| Module layout, cache layers | [architecture.md](design-docs/architecture.md) |
| Request/response types, SSE events | [api-contract.md](design-docs/api-contract.md) |
| Timeouts, quorum, breakers | [resilience.md](design-docs/resilience.md) |
| Metrics, tracing plan | [observability.md](design-docs/observability.md) |
| K8s manifests, HPA, Redis | [kubernetes.md](design-docs/kubernetes.md) |
