# Load tests

[k6](https://k6.io/) scripts to measure trip search latency and per-pod capacity.

**What is k6?** A load testing tool. Each **VU** (virtual user) simulates one client sending requests. Ramping VUs up tests how the app behaves under increasing concurrency.

---

## What we're testing against

| Target | Value | Notes |
|--------|-------|-------|
| p95 search latency (cache miss) | < 3s | Primary SLO — checked by `search-sync.js` |
| Per-pod in-flight capacity | ~100 | On 512Mi / 1 CPU — **measure** with `capacity.js`, don't assume |
| Peak module target | 10k in-flight searches | Needs ~100 pods in K8s — see [kubernetes.md](../design-docs/kubernetes.md) |

Tests run against **mock providers** by default (`MOCK_PROVIDERS=true`, `MOCK_LLM=true`). Results reflect app + Redis overhead, not real GDS or OpenAI latency.

**OpenAI note:** With `MOCK_LLM=false`, sync search still regex-parses the scripted k6 queries first (no OpenAI call). OpenAI is only used on sync when regex can't match, and always first on the stream endpoint. For CI with no OpenAI dependency, keep `MOCK_LLM=true` or omit `OPENAI_API_KEY`.

---

## Quick start (local)

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/), start the app (`npm run start` or `npm run dev`), then:

```bash
npm run loadtest:smoke      # 2 VUs, 15s — does the app respond?
npm run loadtest:sync       # ramp to 50 VUs, hold 2m — p95 vs 3s SLO
npm run loadtest:stream     # SSE endpoint, ramp to 30 VUs
npm run loadtest:capacity   # step ramp to 100 VUs — find per-pod ceiling
```

Scripts target `http://localhost:3000` by default. Override with `BASE_URL`:

```bash
BASE_URL=http://127.0.0.1:3001 npm run loadtest:smoke
```

---

## Docker (Compose network)

Stack must be up (`docker compose up`). k6 runs in a one-off container and hits `http://trip-search:3000`:

```bash
npm run loadtest:docker:smoke
npm run loadtest:docker:sync
npm run loadtest:docker:stream
npm run loadtest:docker:capacity
```

Or directly:

```bash
docker compose --profile loadtest run --rm k6 run /scripts/smoke.js
```

---

## Scenarios

| Script | Endpoint | Purpose |
|--------|----------|---------|
| `smoke.js` | `/api/health`, `/api/trips/search` | CI gate, post-deploy check |
| `search-sync.js` | `POST /api/trips/search` | Primary SLO validation (p95 < 3s) |
| `search-stream.js` | `POST /api/trips/search/stream` | SSE path used by chat UI |
| `capacity.js` | `POST /api/trips/search` | Step-ramp to find per-pod ceiling |

Queries rotate across 12 city-pair variants to limit cache hit skew.

---

## Tuning

| Env var | Default | Purpose |
|---------|---------|---------|
| `BASE_URL` | `http://localhost:3000` (Compose: `http://trip-search:3000`) | Target service |
| `K6_RAMP_VUS` | 10 | Initial ramp target |
| `K6_TARGET_VUS` | 50 (sync), 30 (stream), 100 (capacity) | Peak virtual users |
| `K6_HOLD_DURATION` | `2m` | Steady-state duration |
| `K6_STEP_VUS` | 10 | Capacity test step size |
| `K6_STEP_DURATION` | `1m` | Duration per capacity step |
| `P95_SLO_MS` | 3000 | Threshold for pass/fail |
| `MAX_ERROR_RATE` | 0.02 | Max failed requests (2%) |

Heavier sync run against Compose:

```bash
K6_TARGET_VUS=80 K6_HOLD_DURATION=5m npm run loadtest:sync
```

Large-scale run (K8s cluster only — not for a laptop):

```bash
k6 run -e BASE_URL=https://search.ziarah.internal \
  -e K6_TARGET_VUS=10000 \
  -e K6_RAMP_VUS=500 \
  load/search-sync.js
```

---

## Interpreting capacity.js

The script ramps VUs in steps (default +10 every minute to 100). After the run:

- **p95 < 3000ms** at step N → ~N concurrent in-flight searches per pod is sustainable.
- **p95 > 3000ms** or rising error rate → you've found the pod ceiling; tune replicas or resources.

Run on hardware matching prod (512Mi / 1 CPU per [kubernetes.md](../design-docs/kubernetes.md#scaling-plain-english)).

---

## Exporting results

```bash
docker compose --profile loadtest run --rm k6 run \
  --out json=load/results/run.json \
  /scripts/search-sync.js
```

`load/results/*.json` is gitignored.
