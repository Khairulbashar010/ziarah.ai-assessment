# Ziarah Trip Search

Assessment deliverable for [Ziarah.ai](https://ziarah.ai): natural-language trip search that calls Sabre, Amadeus, and HotelBeds in parallel, normalizes the results, and returns ranked flights and hotels for the chat UI.

**How it works (short version):**

1. User describes a trip in the chat UI.
2. The app parses the text into structured search parameters (dates, cities, budget, passengers).
3. Three providers are queried at the same time.
4. Results stream back to the UI as each provider finishes.
5. Offers are ranked and filtered against the trip budget.

Architecture, API contract, resilience, and deployment notes: [`design-docs/`](design-docs/) — start with [system-design.md](design-docs/system-design.md).

---

## UI walkthrough

Natural-language trip search from landing page through streamed results. Example query used throughout:

> family of 4 from Dubai to London, December 20-27, budget $3000

**Landing** — quick-start chips and a single prompt to describe the whole trip.

![Landing page — Meet Ziarah Travel AI](assets/screenshots/01-landing.png)

**Planning** — the chat workspace streams progress as the orchestrator parses the query and fans out to providers. Processing steps update live while results load.

![Planning your trip — processing steps and skeleton loaders](assets/screenshots/02-planning.png)

**Flights** — ranked offers with route timeline, sort/filter controls, trip-level budget toggle, and a running total in the footer. Follow-up messages (e.g. "Let's make it 5k") refine the search in place.

![Flight results — Dubai to London with budget-aware ranking](assets/screenshots/03-flights.png)

**Hotels** — multi-stay planner, per-night pricing, and budget headroom after the selected flight. Pick hotels across the trip; the footer tracks combined flight + stay cost.

![Hotel results — stay plan builder and multi-hotel selection](assets/screenshots/04-hotels.png)

---

## How to run it

### Docker Compose (fastest path)

Mock mode by default — no provider keys, no OpenAI key, Redis included:

```bash
docker compose up --build
```

### URLs (Docker Compose)

| Service | URL | Notes |
|---------|-----|-------|
| Trip search (UI) | [http://localhost:3000](http://localhost:3000) | Chat workspace — natural-language search |
| Health | [http://localhost:3000/api/health](http://localhost:3000/api/health) | Expect `redis: "ok"` |
| Trip search (sync) | `POST http://localhost:3000/api/trips/search` | JSON body `{ "query": "..." }` |
| Trip search (stream) | `POST http://localhost:3000/api/trips/search/stream` | SSE — used by the chat UI |
| Trip by ID | `GET http://localhost:3000/api/trips/{requestId}` | Cached result lookup |
| Grafana | [http://localhost:3001](http://localhost:3001) | `admin` / `admin` — override via `GRAFANA_ADMIN_*` in `.env` |
| Grafana dashboard | [http://localhost:3001/d/trip-search-logs/trip-search-logs](http://localhost:3001/d/trip-search-logs/trip-search-logs) | **Trip Search → Trip Search Logs** — filter by `requestId` |
| Prometheus | [http://localhost:9090](http://localhost:9090) | Scrapes `GET /api/metrics` every 15s |
| Metrics | `GET http://localhost:3000/api/metrics` | Prometheus exposition format (`prom-client`) |
| Loki | [http://localhost:3100](http://localhost:3100) | Log storage (Grafana queries it; Promtail ships app stdout) |
| Redis | `redis://localhost:6379` | Query cache, result store, refresh locks |

Port overrides: `HOST_PORT`, `GRAFANA_HOST_PORT`, `PROMETHEUS_HOST_PORT`, `LOKI_HOST_PORT`, `REDIS_HOST_PORT` in `.env` (see `.env.example`).

**Debugging a request:**

1. Copy `X-Request-Id` from an API response header → paste it into the Grafana **Trip Search Logs** dashboard to see structured logs.
2. Check `GET /api/metrics` or Prometheus (`:9090`) for `trip_search_duration_ms`, `provider_duration_ms`, and `quorum_failures_total`.
3. OpenTelemetry spans (when `OTEL_ENABLED=true`) print to stdout in Docker Compose (`OTEL_TRACES_EXPORTER=console` by default).

### Observability (Docker Compose)

After `docker compose up --build`, run a few searches so metrics have data to scrape.

**Logs — Grafana**

1. Open [http://localhost:3001](http://localhost:3001) (`admin` / `admin` by default).
2. Go to **Dashboards → Trip Search → Trip Search Logs**.
3. Paste a `requestId` from `X-Request-Id` into the dashboard variable to filter events (`search_start` → `provider_result` → `search_complete`).

**Metrics — Prometheus**

1. Open [http://localhost:9090](http://localhost:9090).
2. **Graph** — try `trip_search_duration_ms_bucket`, `provider_duration_ms_bucket`, or `rate(quorum_failures_total[5m])`.
3. **Alerts** — provisioned rules include p95 > 3s, quorum failure rate > 5%, circuit breaker open, provider timeouts, cache hit ratio, and Redis down (`observability/prometheus/alerts.yml`).

Raw exposition format is also at `GET http://localhost:3000/api/metrics`.

**Traces — app stdout**

Spans print to the `trip-search` container logs when `OTEL_ENABLED=true` (default in Compose). Set `OTEL_EXPORTER_OTLP_ENDPOINT` to ship spans to Tempo/Jaeger instead of stdout.

```bash
docker compose logs -f trip-search
```

**Alerts — Grafana**

1. In Grafana, open **Alerting → Alert rules**.
2. Filter by folder **Trip Search** — rules are auto-provisioned from `observability/grafana/provisioning/alerting/rules.yml`:
   - Trip search p95 > 3s
   - Quorum failure rate > 5%
   - Redis connection down

Notification channels (Slack, PagerDuty, etc.) are not wired in this repo — add a contact point in Grafana to receive fires. Full metric and alert reference: [observability.md](design-docs/observability.md).

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

Copy `.env.example` → `.env` and adjust mock flags (see [Mock and live configuration](#mock-and-live-configuration) below). Docker Compose defaults to all-mock providers with no keys required.

| Service | URL |
|---------|-----|
| Trip search (UI + API) | [http://localhost:3000](http://localhost:3000) |
| Health | [http://localhost:3000/api/health](http://localhost:3000/api/health) |
| Redis | `redis://localhost:6379` |

Grafana, Loki, and Prometheus are not started in local-only mode — use Docker Compose for the full observability stack. Metrics and tracing still work locally (`GET /api/metrics`; spans to stdout when `OTEL_ENABLED=true`).

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

---

## Testing

Two layers: **Vitest** for unit and integration tests (~100 files under `tests/`), and **[k6](https://k6.io/)** for smoke and load tests against a running app.

### Unit and integration tests (Vitest)

Runs with mocked providers and a mocked Redis client (`tests/unit/setup.ts`) — no live GDS, HotelBeds, or OpenAI calls. Metrics and tracing are disabled in the default test setup (`METRICS_ENABLED=false`, `OTEL_ENABLED=false`); observability has dedicated tests that opt in.

```bash
npm test                  # run once (CI)
npm run test:watch        # re-run on file changes
npx vitest run --coverage # coverage report (80% thresholds in vitest.config.ts)
```

Run a subset by path:

```bash
npx vitest run tests/unit/lib/orchestration
npx vitest run tests/unit/app/api/trips/search/route.test.ts
```

| Area | Location | What it covers |
|------|----------|----------------|
| **Orchestration** | `tests/unit/lib/orchestration/` | Trip search pipeline, quorum, cache, SSE stream, budget filter, provider errors |
| **API routes** | `tests/unit/app/api/` | `GET /api/health`, `GET /api/metrics`, `POST /api/trips/search`, `POST /api/trips/search/stream`, `GET /api/trips/{id}` |
| **Observability** | `tests/unit/lib/observability/` | Prometheus metrics, OpenTelemetry tracing, structured logging |
| **Normalization** | `tests/unit/lib/normalization/` | Sabre, Amadeus, HotelBeds payload → unified offer shapes |
| **Providers** | `tests/unit/lib/providers/` | Client/auth, mock mode, live adapter request builders |
| **LLM parsing** | `tests/unit/lib/llm/` | Regex + OpenAI parsers, schemas, chat intent, trip modifications |
| **Resilience** | `tests/unit/lib/resilience/` | Timeouts, circuit breaker |
| **Storage & cache** | `tests/unit/lib/storage/` | Redis helpers, query cache, result store |
| **Client & UI logic** | `tests/unit/lib/client/`, `tests/components/` | Trip search client, filters, budget, hotels; React components (Testing Library) |
| **Pages** | `tests/app/` | Landing, chat workspace, layout render smoke tests |
| **Mocks** | `tests/unit/mocks/` | Seed data, MSW-style handlers, artificial latency |

Provider mocks mirror real Sabre/Amadeus/HotelBeds response shapes so normalization and orchestration tests catch field-mapping regressions without sandbox quota.

### Smoke and load tests (k6)

These hit a **running** app (`npm run dev`, `npm run start`, or `docker compose up`). Default target is `http://localhost:3000`. Use mock mode (`MOCK_PROVIDERS=true`, `MOCK_LLM=true`) so results reflect app + Redis overhead, not real GDS latency.

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) locally, or use the Docker scripts against the Compose stack.

| Script | Command | Purpose |
|--------|---------|---------|
| **Smoke** | `npm run loadtest:smoke` | 2 VUs, 15s — `GET /api/health` + `POST /api/trips/search`; CI / post-deploy gate |
| **Sync SLO** | `npm run loadtest:sync` | Ramp to 50 VUs, hold 2m — p95 vs **3s** SLO on sync search |
| **Stream** | `npm run loadtest:stream` | SSE path (`POST /api/trips/search/stream`), ramp to 30 VUs — chat UI route |
| **Capacity** | `npm run loadtest:capacity` | Step-ramp to ~100 VUs — find per-pod in-flight ceiling |

Override the target host:

```bash
BASE_URL=http://127.0.0.1:3001 npm run loadtest:smoke
```

**Docker** (stack must be up — `docker compose up`):

```bash
npm run loadtest:docker:smoke
npm run loadtest:docker:sync
npm run loadtest:docker:stream
npm run loadtest:docker:capacity
```

Tuning (`K6_TARGET_VUS`, `K6_HOLD_DURATION`, `P95_SLO_MS`, etc.), scenario details, and K8s-scale runs: [load/README.md](load/README.md).

### Mock and live configuration

All toggles live in `.env` (copy from `.env.example`). Restart the app after changing them.

**Check what's active:** `GET /api/health` returns `mockProviders`, `providerMocks` (per provider), and `mockLlm`.

```bash
curl -s http://localhost:3000/api/health | jq '{mockProviders, providerMocks, mockLlm}'
```

#### Provider mocks

| Variable | Default | Effect |
|----------|---------|--------|
| `MOCK_PROVIDERS` | `true` | Master switch. `false` = call real APIs (credentials required). |
| `MOCK_SABRE` | *(inherits)* | Override Sabre only — `true` = mock, `false` = live sandbox. |
| `MOCK_AMADEUS` | *(inherits)* | Override Amadeus only. |
| `MOCK_HOTELBEDS` | *(inherits)* | Override HotelBeds only. |

Per-provider vars override the master switch. Unset = follow `MOCK_PROVIDERS`.

**Credentials needed when live** (`MOCK_*=false`):

| Provider | Env vars |
|----------|----------|
| Sabre | `SABRE_CLIENT_ID`, `SABRE_CLIENT_SECRET`, `SABRE_PCC` |
| Amadeus | `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` |
| HotelBeds | `HOTELBEDS_API_KEY`, `HOTELBEDS_API_SECRET` |

#### LLM mock

| Variable | Default | Effect |
|----------|---------|--------|
| `MOCK_LLM` | `false` in `.env.example` | `true` = regex parser only — no OpenAI calls (CI, load tests). |
| `OPENAI_API_KEY` | empty | When set and `MOCK_LLM` is not `true`, OpenAI parses free-form queries first; regex is the fallback. |

Without a key, parsing always falls back to regex regardless of `MOCK_LLM`.

#### Metrics and tracing

| Variable | Default | Effect |
|----------|---------|--------|
| `METRICS_ENABLED` | `true` | `false` disables `GET /api/metrics` and in-process Prometheus recording |
| `OTEL_ENABLED` | `true` | `false` disables OpenTelemetry spans |
| `OTEL_TRACES_EXPORTER` | `console` in Compose | Where spans go (`console` = stdout) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | Set to export spans to Tempo/Jaeger (e.g. `http://tempo:4318`) |

Vitest sets `METRICS_ENABLED=false` and `OTEL_ENABLED=false` in `tests/unit/setup.ts` to keep unit tests isolated.

#### Common setups

**All mock (Docker demo, no keys needed):**

```env
MOCK_PROVIDERS=true
MOCK_LLM=true
```

**Live Sabre + HotelBeds, mock Amadeus:**

```env
MOCK_PROVIDERS=false
MOCK_AMADEUS=true
SABRE_CLIENT_ID=...
SABRE_CLIENT_SECRET=...
SABRE_PCC=...
HOTELBEDS_API_KEY=...
HOTELBEDS_API_SECRET=...
```

**Live providers + live LLM:**

```env
MOCK_PROVIDERS=false
MOCK_LLM=false
OPENAI_API_KEY=sk-...
# plus provider credentials above
```

Docker Compose defaults to `MOCK_PROVIDERS=true`. LLM mode comes from your `.env` file (`env_file` in `docker-compose.yml`).

#### Mock chaos (testing only)

Only apply when providers are mocked:

| Variable | Default | Effect |
|----------|---------|--------|
| `MOCK_LATENCY_MS_MIN` / `MAX` | 200 / 800 | Artificial delay per provider call |
| `MOCK_FAILURE_RATE` | 0 | Random failure probability (0–1) |

Deterministic failure triggers (origin `ZZZ`, `destinationCode` `FAIL`, etc.) are documented in [resilience.md](design-docs/resilience.md).

**What's live today:** Sabre BFM and HotelBeds availability can hit real sandboxes. Amadeus live code exists but needs credentials — set `MOCK_AMADEUS=false` when available.

---

## Design trade-offs

**Modular monolith over microservices.** The bottleneck is GDS and HotelBeds latency, not CPU. Splitting parse, fan-out, and normalize into separate services adds network hops inside a 3s p95 budget. One Next.js image, clear module boundaries under `src/lib/`, horizontal scale via pod count. A separate provider gateway would only make sense when credential management and rate limiting outgrow a single module.

**2-of-3 quorum.** Every search calls three providers (Sabre, Amadeus, HotelBeds). At least two must respond successfully, or the API returns HTTP 503. This gives redundancy on the flight side (two GDSs) while still allowing partial success — e.g. Sabre + Amadeus OK but HotelBeds down returns flights with `partialResults: true`, not a hard error. Only 0 or 1 providers succeeding triggers 503.

**One quorum retry on provider calls.** If fewer than 2 of 3 succeed on the first fan-out, only the failed providers are retried once (1s cap by default). Still bounded by the 3s sync global timeout. Circuit breaker (3 failures → 30s open) and client/cache retry cover longer outages.

**SSE-first, sync second.** The chat UI streams `provider` and `offers_update` events so users see results land instead of waiting on the slowest GDS. The sync route exists for tests and simple clients; it wraps the same pipeline with a global timeout.

**Mock LLM by default.** Regex + deterministic parser keeps CI and Docker reproducible without OpenAI spend. Production path is OpenAI structured output with regex fallback — set `MOCK_LLM=false` when you have a key.

**Provider-native mocks.** Mock payloads mirror real Sabre/Amadeus/HotelBeds response shapes so normalization tests catch field-mapping bugs without sandbox quota. Trade-off: larger seed files, optional Mockaroo regeneration.

**Redis from day one.** An in-memory `Map` works for single-pod dev, but multi-replica production needs shared query cache, result store, and refresh locks. Redis is a hard dependency in Compose and the K8s design.

**Trip-level budget.** Users say "$3000 for the trip," not "$1500 flights, $1500 hotels." Filtering happens after ranking across both verticals. Per-vertical caps from one number aren't supported in v1.

**Observability in three signals.** Structured logs (pino → Loki) for request debugging, Prometheus metrics on `/api/metrics` for SLOs and alerting, OpenTelemetry spans for latency breakdown. Trade-off: more moving parts in Docker Compose (Promtail, Loki, Prometheus, Grafana) vs. running logs-only locally.

---

## Future improvements

Ordered by priority if this were going to production.

**1. Finish the integration surface**

- Live Amadeus OAuth + flight search (parity with Sabre adapter)
- Token refresh and credential rotation for all providers
- Booking path: HotelBeds CheckRate, Sabre revalidate — search-only is done; ticketing is not

**2. Observability before scale**

- OTLP export to Tempo/Jaeger in production (local Compose uses console exporter by default)
- Grafana metrics dashboard and alert notification channels (Slack/PagerDuty)
- Load test to validate 10k concurrent / 3s p95 — math in [kubernetes.md](design-docs/kubernetes.md); evidence still needed

**3. Resilience gaps**

- Stale hotel cache fallback when HotelBeds is down — serve last-known inventory with a freshness banner instead of flights-only partial results
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
| Logs, metrics, traces, alerts | [observability.md](design-docs/observability.md) |
| K8s manifests, HPA, Redis | [kubernetes.md](design-docs/kubernetes.md) |
